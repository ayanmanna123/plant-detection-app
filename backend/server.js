const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define Plant Detection Schema
const plantDetectionSchema = new mongoose.Schema({
  originalImageName: String,
  imageData: String, // Base64 encoded image
  mimeType: String,  // Store the image mime type
  detectedAt: { type: Date, default: Date.now },
  plantInfo: String,
  scientificName: String,
  commonName: String
}, { timestamps: true });

const PlantDetection = mongoose.model('PlantDetection', plantDetectionSchema);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Configure multer for memory storage (not disk storage)
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// Function to extract key information from plant data
function extractPlantData(text) {
  let scientificName = '';
  let commonName = '';

  // Simple regex to try to extract scientific and common names
  const scientificMatch = text.match(/Scientific name.*?:\s*([A-Z][a-z]+ [a-z]+)/i);
  if (scientificMatch && scientificMatch[1]) {
    scientificName = scientificMatch[1];
  }

  const commonMatch = text.match(/Common name.*?:\s*([^\n]+)/i);
  if (commonMatch && commonMatch[1]) {
    commonName = commonMatch[1].trim();
  }

  return { scientificName, commonName };
}

// Plant detection endpoint
app.post('/api/detect-plant', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const originalImageName = req.file.originalname;
    const mimeType = req.file.mimetype;
    
    // Convert buffer to base64
    const imageBase64 = req.file.buffer.toString('base64');
    
    // Prepare payload for Gemini API
    const payload = {
      contents: [
        {
          parts: [
            {
              text: "Identify this plant. Please provide the following information: " +
                    "1. Scientific name (Latin name) " +
                    "2. Common name " +
                    "3. Plant family " +
                    "4. Brief description " +
                    "5. Growing conditions " +
                    "6. Care tips"
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ],
      generation_config: {
        temperature: 0.4,
        max_output_tokens: 2048
      }
    };

    // Make direct HTTP request to Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await axios.post(geminiUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Extract text from Gemini response
    let plantInfo = '';
    if (response.data && 
        response.data.candidates && 
        response.data.candidates[0] && 
        response.data.candidates[0].content && 
        response.data.candidates[0].content.parts) {
      
      // Combine all text parts from the response
      plantInfo = response.data.candidates[0].content.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join('\n');
    }
    
    // Extract key plant information
    const { scientificName, commonName } = extractPlantData(plantInfo);

    // Save to MongoDB
    const plantDetection = new PlantDetection({
      originalImageName,
      imageData: `data:${mimeType};base64,${imageBase64}`, // Store base64 image data
      mimeType,
      plantInfo,
      scientificName,
      commonName
    });
    
    await plantDetection.save();
    
    res.json({ 
      plantInfo,
      id: plantDetection._id,
      scientificName,
      commonName,
      imageUrl: `/api/images/${plantDetection._id}` // URL to access the image via API
    });
  } catch (error) {
    console.error('Error detecting plant:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.error?.message || error.message || 'Failed to detect plant' 
    });
  }
});

// Endpoint to serve images from MongoDB
app.get('/api/images/:id', async (req, res) => {
  try {
    const plantDetection = await PlantDetection.findById(req.params.id);
    if (!plantDetection || !plantDetection.imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Extract the base64 data and mime type
    const imageDataParts = plantDetection.imageData.split(',');
    const mimeType = plantDetection.mimeType || 'image/jpeg'; // Default to jpeg if missing
    
    // Send the image with appropriate content type
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'max-age=86400'
    });
    
    // If data is in format "data:image/jpeg;base64,ACTUAL_DATA"
    const base64Data = imageDataParts.length > 1 ? imageDataParts[1] : imageDataParts[0];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    res.end(imageBuffer);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Get all plant detections
app.get('/api/detections', async (req, res) => {
  try {
    const detections = await PlantDetection.find()
      .sort({ detectedAt: -1 })
      .select('originalImageName detectedAt scientificName commonName _id');
    
    // Add image URLs to each detection
    const detectionsWithUrls = detections.map(detection => {
      const item = detection.toObject();
      item.imageUrl = `/api/images/${detection._id}`;
      return item;
    });
    
    res.json(detectionsWithUrls);
  } catch (error) {
    console.error('Error fetching detections:', error);
    res.status(500).json({ error: 'Failed to fetch plant detections' });
  }
});

// Get a specific plant detection by ID
app.get('/api/detections/:id', async (req, res) => {
  try {
    const detection = await PlantDetection.findById(req.params.id);
    if (!detection) {
      return res.status(404).json({ error: 'Plant detection not found' });
    }
    
    // Create a sanitized version without the full imageData to reduce response size
    const sanitizedDetection = detection.toObject();
    delete sanitizedDetection.imageData; // Remove the large base64 data
    sanitizedDetection.imageUrl = `/api/images/${detection._id}`; // Add URL to access the image
    
    res.json(sanitizedDetection);
  } catch (error) {
    console.error('Error fetching detection:', error);
    res.status(500).json({ error: 'Failed to fetch plant detection' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
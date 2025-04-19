import React, { useState, useEffect } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [plantInfo, setPlantInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detectionHistory, setDetectionHistory] = useState([]);
  const [currentView, setCurrentView] = useState("upload"); // 'upload' or 'history'
  const [selectedDetection, setSelectedDetection] = useState(null);

  // Fetch detection history on component mount
  useEffect(() => {
    fetchDetectionHistory();
  }, []);

  const fetchDetectionHistory = async () => {
    try {
      const response = await axios.get("https://plant-detection-app.vercel.app/api/detections");
      setDetectionHistory(response.data);
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);

      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);

      // Reset results when a new file is selected
      setPlantInfo(null);
      setError(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setError("Please select an image first");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await axios.post(
        "https://plant-detection-app.vercel.app/api/detect-plant",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setPlantInfo(response.data);
      fetchDetectionHistory(); // Refresh history after new detection
    } catch (err) {
      console.error("Error uploading image:", err);
      setError(
        err.response?.data?.error ||
          "Failed to identify plant. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const viewDetection = async (id) => {
    try {
      const response = await axios.get(
        `https://plant-detection-app.vercel.app/api/detections/${id}`
      );
      setSelectedDetection(response.data);
      setCurrentView("details");
    } catch (err) {
      console.error("Error fetching detection details:", err);
    }
  };

  // Function to render Markdown content
  const renderMarkdown = (text) => {
    if (!text) return "";

    // Replace Markdown with HTML
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold
      .replace(/\*(.*?)\*/g, "<em>$1</em>") // Italic
      .replace(/^(\s*\*\s+(.*)(\n|$))+/gm, function (match) {
        // Bullet lists
        return (
          "<ul>" +
          match
            .split("\n")
            .filter((item) => item.trim())
            .map((item) => `<li>${item.replace(/^\s*\*\s+/, "")}</li>`)
            .join("") +
          "</ul>"
        );
      });
  };

  // Upload View
  const renderUploadView = () => (
    <div className="card shadow">
      <div className="card-header bg-success text-white">
        <h1 className="text-center mb-0">Plant Identifier</h1>
      </div>
      <div className="card-body">
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="imageUpload" className="form-label">
              Upload a plant image
            </label>
            <input
              type="file"
              className="form-control"
              id="imageUpload"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>

          {preview && (
            <div className="mb-3 text-center">
              <img
                src={preview}
                alt="Preview"
                className="img-fluid rounded"
                style={{ maxHeight: "300px" }}
              />
            </div>
          )}

          <div className="d-grid">
            <button
              type="submit"
              className="btn btn-success"
              disabled={loading || !selectedFile}
            >
              {loading ? "Identifying Plant..." : "Identify Plant"}
            </button>
          </div>
        </form>

        {error && <div className="alert alert-danger mt-3">{error}</div>}

        {plantInfo && (
          <div className="mt-4">
            <h2 className="text-center mb-3">Plant Information</h2>
            <div className="card">
              <div className="card-body">
                <h3>{plantInfo.commonName || "Unknown Plant"}</h3>
                <em className="text-muted">{plantInfo.scientificName || ""}</em>
                <div
                  className="mt-3"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(plantInfo.plantInfo),
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // History View with Images
  const renderHistoryView = () => (
    <div className="card shadow">
      <div className="card-header bg-success text-white">
        <h1 className="text-center mb-0">Detection History</h1>
      </div>
      <div className="card-body">
        {detectionHistory.length === 0 ? (
          <p className="text-center">No detection history found</p>
        ) : (
          <div className="row">
            {detectionHistory.map((detection) => (
              <div key={detection._id} className="col-md-6 col-lg-4 mb-4">
                <div
                  className="card h-100 plant-card"
                  onClick={() => viewDetection(detection._id)}
                >
                  <div className="plant-image-container">
                    {detection.imageUrl && (
                      <img
                        src={`https://plant-detection-app.vercel.app${detection.imageUrl}`}
                        alt={detection.commonName || "Plant"}
                        className="card-img-top plant-thumbnail"
                      />
                    )}
                  </div>
                  <div className="card-body">
                    <h5 className="card-title">
                      {detection.commonName || "Unknown Plant"}
                    </h5>
                    <p className="card-text text-muted fst-italic">
                      {detection.scientificName ||
                        "Scientific name not available"}
                    </p>
                    <p className="card-text">
                      <small className="text-muted">
                        {new Date(detection.detectedAt).toLocaleDateString()}
                      </small>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Detail View with Image
  const renderDetailView = () => {
    if (!selectedDetection) return null;

    return (
      <div className="card shadow">
        <div className="card-header bg-success text-white">
          <div className="d-flex justify-content-between align-items-center">
            <h1 className="mb-0">Plant Details</h1>
            <button
              className="btn btn-light btn-sm"
              onClick={() => setCurrentView("history")}
            >
              Back to History
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-4 mb-4">
              {selectedDetection.imageUrl && (
                <img
                  src={`https://plant-detection-app.vercel.app${selectedDetection.imageUrl}`}
                  alt={selectedDetection.commonName || "Plant"}
                  className="img-fluid rounded"
                />
              )}
            </div>
            <div className="col-md-8">
              <h2>{selectedDetection.commonName || "Unknown Plant"}</h2>
              <h3 className="text-muted fst-italic">
                {selectedDetection.scientificName || ""}
              </h3>
              <p className="text-muted">
                Detected on:{" "}
                {new Date(selectedDetection.detectedAt).toLocaleString()}
              </p>
              <hr />
              <div
                className="plant-info"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(selectedDetection.plantInfo),
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mt-5 mb-5">
      <div className="row mb-4">
        <div className="col-12">
          <ul className="nav nav-pills nav-fill">
            <li className="nav-item">
              <button
                className={`nav-link ${
                  currentView === "upload" ? "active bg-success" : ""
                }`}
                onClick={() => setCurrentView("upload")}
              >
                Identify a Plant
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${
                  currentView === "history" || currentView === "details"
                    ? "active bg-success"
                    : ""
                }`}
                onClick={() => {
                  setCurrentView("history");
                  fetchDetectionHistory();
                }}
              >
                Detection History
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-md-10">
          {currentView === "upload" && renderUploadView()}
          {currentView === "history" && renderHistoryView()}
          {currentView === "details" && renderDetailView()}
        </div>
      </div>
    </div>
  );
}

export default App;

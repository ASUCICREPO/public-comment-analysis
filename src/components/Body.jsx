import { useState, useContext } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import logo from "../assets/logo.svg";
import documentIcon from "../assets/document.svg";
import { CircularProgress, InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import InsightsIcon from "@mui/icons-material/Insights";
import { AppContext, dummydocument } from "../AppContext";
import SentimentAnalysisPopup from "./SentimentAnalysisPopup";

const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL;
const restApiUrl = import.meta.env.VITE_RESTAPI_URL;

function Body() {
  const { processingDocs, completedDocs } = useContext(AppContext);
  const [openPopups, setOpenPopups] = useState([]);
  const [zIndex, setZindex] = useState(1);

  const handleOpenPopup = async (document) => {
    const details = await fetchDocumentDetails(document.id);
    let negativeSentimentCount = 0;
    let positiveSentimentCount = 0;
    let neutralSentimentCount = 0;
    let clusters = [];
    details.analysis.clusters.forEach((cluster, index) => {
      const sentiment = cluster.overallSentiment;
      clusters.push({ ...cluster, commentCount: details.analysis.clustering_metadata.comments_per_cluster[index] });
      if (sentiment === "Negative") {
        negativeSentimentCount++;
      } else if (sentiment === "Positive") {
        positiveSentimentCount++;
      } else if (sentiment === "Neutral") {
        neutralSentimentCount++;
      }
    });
    // Sort clusters by commentCount in descending order
    clusters.sort((a, b) => b.commentCount - a.commentCount);
    let overallSentiment = "Neutral"; // Default
    if (positiveSentimentCount > Math.max(negativeSentimentCount, neutralSentimentCount)) {
      overallSentiment = "Positive";
    } else if (negativeSentimentCount > Math.max(positiveSentimentCount, neutralSentimentCount)) {
      overallSentiment = "Negative";
    }
    const parsedDetails = {
      id: details.documentId,
      title: details?.documentTitle,
      status: details?.status,
      completionPerc: details?.progress,
      linkToDoc: "",
      overallSentiment: overallSentiment,
      negativeSentimentCount: negativeSentimentCount,
      positiveSentimentCount: positiveSentimentCount,
      neutralSentimentCount: neutralSentimentCount,
      clusters: clusters || [],
      processingMetadata: details?.analysis?.processingMetadata || { total_comments: 0, comments_with_attachments: 0, total_attachments: 0, processing_timestamp: "" },
    };
    if (!openPopups.some((popup) => popup.id === document.id)) {
      setOpenPopups((prev) => [...prev, { ...parsedDetails, id: document.id, index: prev.length, zIndex: zIndex + 10 }]);
    }
  };
  const fetchDocumentDetails = async (documentId) => {
    try {
      const response = await fetch(`${restApiUrl}/documents/${documentId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch document details");
      }
      return await response.json();
    } catch (error) {
      console.error("Error fetching document details:", error);
    }
  };

  const increaseZIndex = () => {
    setZindex((prev) => (prev += 10));
  };
  const handleClosePopup = (id) => {
    setOpenPopups((prev) => prev.filter((popup) => popup.id !== id));
  };

  return (
    <>
      <Stack spacing={5} sx={{ paddingLeft: "20%", paddingRight: "20%" }}>
        {processingDocs.length > 0 && (
          <Stack direction="column" spacing={1}>
            <Typography className="headertext" variant="subtitle1">
              Processing
            </Typography>

            <Stack direction="row" spacing={1} className="queuedDocsContainer" flexWrap="wrap">
              {processingDocs.map((doc, index) => (
                <Paper key={index} className="processingDocs" elevation={3} sx={{ padding: "8px", display: "flex", alignItems: "center" }}>
                  <img src={documentIcon} alt="Document Icon" style={{ marginRight: "1rem", height: "3rem" }} />
                  <Stack spacing={1} direction="column">
                    <p className="documentName">{doc.id}</p>
                    <p className="compPercText">{doc.completionPerc}% completed </p>
                  </Stack>
                  <CircularProgress variant="determinate" value={doc.completionPerc} sx={{ color: "#FFA01C" }} />
                </Paper>
              ))}
            </Stack>
          </Stack>
        )}
        {completedDocs.length > 0 && (
          <Stack direction="column" spacing={1}>
            <Typography className="headertext" variant="subtitle1">
              Completed Documents
            </Typography>

            <Stack direction="row" spacing={1} className="queuedDocsContainer" flexWrap="wrap">
              {completedDocs.map((doc, index) => (
                <Paper onClick={() => handleOpenPopup(doc)} key={index} className="completedDocs" elevation={3} sx={{ padding: "8px", display: "flex", alignItems: "center" }}>
                  <img src={documentIcon} alt="Document Icon" style={{ marginRight: "1rem", height: "3rem" }} />
                  <Stack spacing={1} direction="column">
                    <p className="documentName">{doc.id}</p>
                    <Button variant="outlined" className="showInsightsButton" aria-label="Button to show insights">
                      Show Insights
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Stack>
        )}
      </Stack>
      {/* Render Popups */}
      {openPopups.map((popup) => (
        <SentimentAnalysisPopup key={popup.id} document={popup} onClose={handleClosePopup} increaseZIndex={increaseZIndex} zIndex={zIndex} />
      ))}
    </>
  );
}

export default Body;

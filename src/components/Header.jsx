import { useState, useContext, useEffect } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import logo from "../assets/logo.svg";
import documentIcon from "../assets/document.svg";
import { InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import InsightsIcon from "@mui/icons-material/Insights";
import { AppContext } from "../AppContext";
import { ToastContainer, toast } from "react-toastify";
const allowedProcessingDoc = 1;
const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL;
const restApiUrl = import.meta.env.VITE_RESTAPI_URL;

function Header() {
  const [documentId, setDocumentId] = useState("");
  const { queuedDocIds, addToQueue, moveToProcessing, moveToCompleted, processingDocs, updateProcessing } = useContext(AppContext);
  const [socket, setSocket] = useState(null);
  const handleAddToQueue = () => {
    if (documentId.trim() && !queuedDocIds.includes(documentId)) {
      addToQueue(documentId);
      setDocumentId(""); // Clear input after adding
    }
  };
  // Initialize WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(websocketUrl);
    ws.onopen = () => console.log("WebSocket connected");
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "PROGRESS_UPDATE") {
        handleProgressUpdate(message);
      }
    };
    ws.onclose = () => console.log("WebSocket disconnected");
    ws.onerror = (error) => console.error("WebSocket error:", error);

    setSocket(ws);

    return () => ws.close();
  }, []);

  const handleProgressUpdate = (message) => {
    const { documentId, status, progress } = message;
    if (progress === 100) {
      // updateProcessing((prevDocs) => prevDocs.filter((doc) => doc.id !== documentId));
      moveToCompleted({
        id: documentId,
        status: status,
        completionPerc: progress,
      }); // Move to completed
    } else {
      updateProcessing({
        id: documentId,
        status: status,
        completionPerc: progress,
      });
    }
  };

  const handleGenerateInsights = () => {
    const remainingSlots = allowedProcessingDoc - processingDocs.length;

    if (remainingSlots > 0) {
      const documentsToProcess = queuedDocIds.slice(0, remainingSlots);

      if (documentsToProcess.length > 0) {
        startProcessing(documentsToProcess); // Pass the documents to process
      } else {
        toast.warn("No documents available in the queue to process.");
      }
    } else {
      toast.warn(`You can only process ${allowedProcessingDoc} documents at a time. Please wait for the current process to complete.`);
    }
  };

  const startProcessing = async (documentsToProcess) => {
    const url = restApiUrl + "/documents";
    const input = {
      documentIds: documentsToProcess,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      const result = await response.json();

      // Map documentsToProcess into an array of processingDocs
      const processingDocsTemp = documentsToProcess.map((id) => ({
        id,
        status: "Processing",
        completionPerc: 0,
      }));

      moveToProcessing(processingDocsTemp); // Move these documents to processing state
      console.log("Processing started:", result);
    } catch (error) {
      console.error("Error starting processing:", error);
    }
  };
  return (
    <Box className="headerContainer">
      <Stack spacing={3}>
        {/* Logo and Header */}
        <Stack direction="row" spacing={3} justifyContent="start" alignItems="center">
          <img src={logo} alt="USDA Logo" style={{ height: "40px" }} />
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            U.S. Department of Agriculture
          </Typography>
        </Stack>

        {/* Search Bar */}
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            fullWidth
            sx={{ background: "#fff" }}
            variant="outlined"
            size="small"
            placeholder="Enter Document ID here"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAddToQueue();
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            aria-label="Enter Document ID"
          />
          <Button variant="outlined" className="primaryButton" onClick={handleAddToQueue} startIcon={<AddIcon />} aria-label="Add Document to Queue">
            Add to Queue
          </Button>
          {queuedDocIds.length > 0 && (
            <Button variant="contained" className="secondaryButton" onClick={handleGenerateInsights} startIcon={<InsightsIcon />} aria-label="Generate Insights">
              Generate Insights
            </Button>
          )}
        </Stack>

        {/* Documents Queued */}
        <Stack direction="column" spacing={1}>
          {queuedDocIds.length > 0 && (
            <Typography variant="subtitle2" sx={{ fontWeight: "medium" }}>
              Documents Queued
            </Typography>
          )}
          <Stack direction="row" spacing={1} className="queuedDocsContainer" flexWrap="wrap">
            {queuedDocIds.map((doc, index) => (
              <Paper key={index} className="queuedDocs" elevation={3} sx={{ padding: "8px", display: "flex", alignItems: "center" }}>
                <img src={documentIcon} alt="Document Icon" style={{ marginRight: "8px" }} />
                <Typography>{doc}</Typography>
              </Paper>
            ))}
          </Stack>
        </Stack>
      </Stack>
      <ToastContainer />
    </Box>
  );
}

export default Header;

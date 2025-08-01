import { useState, useContext } from "react";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import documentIcon from "../assets/document.svg";
import {
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { AppContext } from "../AppContext";

const restApiUrl = import.meta.env.VITE_RESTAPI_URL;

function Body() {
  const { processingDocs, completedDocs } = useContext(AppContext);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentDetails, setDocumentDetails] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleShowInsights = async (doc) => {
    try {
      setLoading(true);
      setSelectedDocument(doc);

      const response = await fetch(`${restApiUrl}/documents/${doc.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch document details");
      }

      const details = await response.json();
      setDocumentDetails(details);
      console.log("📥 Payload:", details);
      console.log("   analysis:", details.analysis);
      console.log("   clusters:", details.analysis?.clusters);
    } catch (error) {
      console.error("Error fetching document details:", error);
      setDocumentDetails(null);
    } finally {
      setLoading(false);
    }
  };

  // Safely grab clusters or default to empty array
  const clusters = documentDetails?.analysis?.clusters ?? [];

  return (
    <>
      <Stack spacing={5} sx={{ paddingLeft: "20%", paddingRight: "20%" }}>
        {processingDocs.length > 0 && (
          <Stack direction="column" spacing={1}>
            <Typography className="headertext" variant="subtitle1">
              Processing
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              className="queuedDocsContainer"
              flexWrap="wrap"
            >
              {processingDocs.map((doc, index) => (
                <Paper
                  key={index}
                  className="processingDocs"
                  elevation={3}
                  sx={{ padding: "8px", display: "flex", alignItems: "center" }}
                >
                  <img
                    src={documentIcon}
                    alt="Document Icon"
                    style={{ marginRight: "1rem", height: "3rem" }}
                  />
                  <Stack spacing={1} direction="column">
                    <p className="documentName">{doc.id}</p>
                    <p className="compPercText">{doc.completionPerc}% completed</p>
                  </Stack>
                  <CircularProgress
                    variant="determinate"
                    value={doc.completionPerc}
                    sx={{ color: "#FFA01C" }}
                  />
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
            <Stack
              direction="row"
              spacing={1}
              className="queuedDocsContainer"
              flexWrap="wrap"
            >
              {completedDocs.map((doc, index) => (
                <Paper
                  key={index}
                  className="completedDocs"
                  elevation={3}
                  sx={{
                    padding: "8px",
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    backgroundColor:
                      selectedDocument?.id === doc.id ? "#f5f5f5" : "white",
                  }}
                  onClick={() => handleShowInsights(doc)}
                >
                  <img
                    src={documentIcon}
                    alt="Document Icon"
                    style={{ marginRight: "1rem", height: "3rem" }}
                  />
                  <Stack spacing={1} direction="column">
                    <p className="documentName">{doc.id}</p>
                    <Button
                      variant="outlined"
                      className="showInsightsButton"
                      aria-label="Button to show insights"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowInsights(doc);
                      }}
                    >
                      Show Insights
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Stack>
        )}

        {selectedDocument && (
          <Box mt={4} p={2} border="1px solid #e0e0e0" borderRadius={1}>
            <Typography variant="h6" gutterBottom>
              Document Insights: {selectedDocument.id}
            </Typography>

            {loading ? (
              <Box display="flex" justifyContent="center" p={3}>
                <CircularProgress />
              </Box>
            ) : documentDetails ? (
              <Box>
                {documentDetails.status === 'RUNNING' ? (
                  <Typography variant="body1" color="primary">
                    Document is still being processed. Current progress: {documentDetails.progress}%
                  </Typography>
                ) : documentDetails.analysis ? (
                  <>
                    <Typography variant="subtitle1" gutterBottom>
                      Analysis Summary
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Total Comments: {documentDetails.analysis.processing_metadata?.total_comments || 0}
                    </Typography>

                    {clusters.length > 0 ? (
                      clusters.map((cluster, idx) => (
                        <Accordion key={idx}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography>
                              Cluster {idx + 1}: {cluster.clusterName || `Topic ${idx + 1}`}
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Typography variant="subtitle2" gutterBottom>
                              Sentiment: {cluster.overallSentiment || "Neutral"}
                            </Typography>

                            {cluster.clusterDescription && (
                              <Typography variant="body2" paragraph>
                                {cluster.clusterDescription}
                              </Typography>
                            )}

                            {Array.isArray(cluster.recActions) && cluster.recActions.length > 0 && (
                              <>
                                <Typography variant="subtitle2" gutterBottom>
                                  Recommended Actions:
                                </Typography>
                                <ul>
                                  {cluster.recActions.map((action, i) => (
                                    <li key={i}>{action}</li>
                                  ))}
                                </ul>
                              </>
                            )}

                            {Array.isArray(cluster.relComments) && cluster.relComments.length > 0 && (
                              <>
                                <Typography variant="subtitle2" gutterBottom>
                                  Representative Comments:
                                </Typography>
                                <ul>
                                  {cluster.relComments.map((comment, i) => (
                                    <li key={i}>{comment}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </AccordionDetails>
                        </Accordion>
                      ))
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        No clusters to display.
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography variant="body1" color="textSecondary">
                    No analysis data available for this document.
                  </Typography>
                )}
              </Box>
            ) : (
              <Typography variant="body1" color="error">
                Failed to load document details. Please try again.
              </Typography>
            )}
          </Box>
        )}
      </Stack>
    </>
  );
}

export default Body;

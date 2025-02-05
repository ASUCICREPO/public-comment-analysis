import React, { createContext, useState } from "react";

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [queuedDocIds, setQueuedDocIds] = useState([]);
  const [processingDocs, setProcessingDocs] = useState([]);
  const [completedDocs, setCompletedDocs] = useState([]);
  const addToQueue = (docId) => {
    if (!queuedDocIds.includes(docId)) {
      setQueuedDocIds((prev) => [...prev, docId]);
    }
  };

  const clearQueue = () => {
    setQueuedDocIds([]);
  };

  const moveToProcessing = (documents) => {
    // Remove documents being processed from the queue
    setQueuedDocIds((prev) => prev.filter((id) => !documents.some((doc) => doc.id === id)));

    // Add documents to processingDocs
    setProcessingDocs((prev) => [...prev, ...documents]);
  };

  const updateProcessing = (doc) => {
    // Update an existing processing document
    setProcessingDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, ...doc } : d)));
  };

  const moveToCompleted = (document) => {
    // Remove the document from processingDocs
    setProcessingDocs((prev) => prev.filter((doc) => doc.id !== document.id));

    // Add the document to completedDocs if not already present
    setCompletedDocs((prev) => {
      const isAlreadyAdded = prev.some((doc) => doc.id === document.id);
      return isAlreadyAdded ? prev : [...prev, document];
    });
  };
  return (
    <AppContext.Provider
      value={{
        queuedDocIds,
        clearQueue,
        processingDocs,
        completedDocs,
        addToQueue,
        moveToProcessing,
        moveToCompleted,
        updateProcessing,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
const processingDocs = [
  {
    id: "DOC12345",
    status: "Processing",
    completionPerc: 0,
  },
];
export const dummydocument = {
  id: "DOC12345",
  title: "Proposed Agricultural Safety Regulations",
  status: "Processing", // Processing/Completed
  completionPerc: 0,
  linkToDoc: "https://example.com/docs/DOC12345",
  overallSentiment: "Positive",
  negativeSentimentCount: 25,
  positiveSentimentCount: 25,
  neutralSentimentCount: 50,
  clusters: [
    {
      clusterName: "Worker Safety Standards",
      overallSentiment: "Positive",
      insights: "Lorem ipsum sakdvasdashduablksa",
      // repOrg: ["Southern Poverty Law Center", "National Council of La Raza", "Farmworker Justice"],
      recActions: ["Withdraw proposed rule", "Conduct comprehensive NIOSH safety study", "Implement worker protection standards"],
      relComments: ["The proposed rule seems to disregard the health and safety of farmworkers.", "There is a strong need for comprehensive safety standards across all agricultural sectors.", "Many stakeholders emphasize the importance of immediate implementation of worker protection standards."],
      linkToComments: "https://example.com/comments/cluster1",
    },
    {
      clusterName: "Economic Impact",
      overallSentiment: "Neutral",
      insights: "Lorem ipsum sakdvasdashduablksa",
      // repOrg: ["American Farm Bureau Federation", "National Farmers Union"],
      recActions: ["Conduct economic impact assessment", "Provide financial subsidies for compliance", "Delay implementation by one fiscal year"],
      relComments: ["Farmers are concerned about the high cost of compliance with the new regulations.", "Some argue that the regulations could negatively affect small farms disproportionately.", "There is a need to balance worker safety with economic viability."],
      linkToComments: "https://example.com/comments/cluster2",
    },
    {
      clusterName: "Environmental Considerations",
      overallSentiment: "Negative",
      insights: "Lorem ipsum sakdvasdashduablksa",
      // repOrg: ["Sierra Club", "Environmental Defense Fund"],
      recActions: ["Integrate environmental impact assessments into the rule", "Adopt stricter pesticide regulations", "Increase funding for research on sustainable agricultural practices"],
      relComments: ["The rule does not adequately address the environmental consequences of proposed changes.", "Advocacy groups are calling for stricter measures to ensure environmental sustainability.", "The absence of clear guidelines for pesticide use is a significant oversight."],
      linkToComments: "https://example.com/comments/cluster3",
    },
  ],
};
// moveToProcessing(processingDocs);
// Remove dummy

// // Simulated API call to start the analysis
// startAnalysis(processingDocs)
//   .then(() => {
//     // Set up WebSocket listeners for each document
//     processingDocs.forEach((doc) => {
//       const ws = new WebSocket(`wss://example.com/progress/${doc.id}`);

//       ws.onmessage = (event) => {
//         const { id, completionPerc } = JSON.parse(event.data);
//         updateProgress(id, completionPerc); // Update progress in context

//         if (completionPerc === 100) {
//           moveToCompleted(id); // Move to completed when done
//           ws.close(); // Close the WebSocket for the completed document
//         }
//       };

//       ws.onerror = (error) => {
//         console.error(`WebSocket error for document ${doc.id}:`, error);
//         ws.close();
//       };
//     });

// clearQueue(); // Clear the queue after processing starts
//   })
//   .catch((error) => {
//     console.error("Error starting analysis:", error);
//   });
//  const startAnalysis = async (processingDocs) => {
//    try {
//      const response = await fetch("https://example.com/start-analysis", {
//        method: "POST",
//        headers: {
//          "Content-Type": "application/json",
//        },
//        body: JSON.stringify({ documents: processingDocs }),
//      });

//      if (!response.ok) {
//        throw new Error("Failed to start analysis");
//      }

//      return await response.json();
//    } catch (error) {
//      console.error("API error:", error);
//      throw error;
//    }
//  };

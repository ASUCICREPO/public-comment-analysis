import React from "react";
import { AppProvider } from "./AppContext";
import "./App.css";
import Stack from "@mui/material/Stack";
import Header from "./components/Header";
import Body from "./components/Body";
import Footer from "./components/Footer";

function App() {
  return (
    <AppProvider>
      <Stack className="height100" spacing={5}>
        <Stack sx={{ height: "fit-content" }}>
          <Header />
        </Stack>
        <Stack className="heightFill">
          <Body />
        </Stack>
        <Stack sx={{ height: "4rem" }}>
          <Footer />
        </Stack>
      </Stack>
    </AppProvider>
  );
}

export default App;
// rate limit
// authorization for accessing the docs - (doc level) list of restricted documents, (user level)  INVALID
// Invalid Doc Id - Error should come up
// Error document section

// wss..../usda/getinsights/DHSDS
// wss..../usda/getinsights/DOC_W18
// wss..../usda/getinsights/DSBIDS

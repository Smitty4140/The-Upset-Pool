import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Helmet } from "react-helmet";

createRoot(document.getElementById("root")!).render(
  <>
    <Helmet>
      <title>NFL Upset Pool - Pick Underdogs and Win</title>
      <meta name="description" content="Join the NFL Upset Pool, pick underdog teams to win outright, and earn points based on spreads. Track your progress on our leaderboard." />
      <meta property="og:title" content="NFL Upset Pool - Pick Underdogs and Win" />
      <meta property="og:description" content="Join the NFL Upset Pool, pick underdog teams to win outright, and earn points based on spreads. Track your progress on our leaderboard." />
      <meta property="og:type" content="website" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </Helmet>
    <App />
  </>
);

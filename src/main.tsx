import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import App from "./App";
import { PostWindow } from "./components/PostWindow";
import "./index.css";

// A popped-out post window (see PostViewer's "Open in new window" button) loads this same
// index.html with ?post=<id>&site=<site> in its URL instead of a route - this app has no
// client-side router at all, so a URL param is the simplest way to tell the two apart at the
// one shared entry point.
const params = new URLSearchParams(window.location.search);
const postId = params.get("post");
const site = params.get("site");

const root = (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {postId && site ? <PostWindow postId={Number(postId)} site={site as "e621" | "e6ai"} /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(root);

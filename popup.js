const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const copyBtn = document.getElementById("copyBtn");
const copyTimestampBtn = document.getElementById("copyTimestampBtn");
const copyAiBtn = document.getElementById("copyAiBtn");

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = type;
}

function setLoading(btn, loading) {
  btn.classList.toggle("loading", loading);
  [copyBtn, copyTimestampBtn, copyAiBtn].forEach((button) => {
    button.disabled = loading;
  });
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getCopyConfig(mode) {
  if (mode === "timestamps") {
    return {
      button: copyTimestampBtn,
      status: "Fetching transcript with timestamps...",
      success: "Copied transcript with timestamps!",
      preview: (response) => response.timestampText,
      text: (response) => response.timestampText,
    };
  }

  if (mode === "ai") {
    return {
      button: copyAiBtn,
      status: "Cleaning transcript for AI...",
      success: "Copied AI-friendly transcript!",
      preview: (response) => response.aiFriendlyText,
      text: (response) => response.aiFriendlyText,
    };
  }

  return {
    button: copyBtn,
    status: "Fetching transcript...",
    success: "Copied transcript!",
    preview: (response) => response.text,
    text: (response) => response.text,
  };
}

async function fetchTranscript(mode = "plain") {
  const tab = await getCurrentTab();

  if (!tab?.url?.includes("youtube.com/watch")) {
    setStatus("Open a YouTube video first.", "error");
    return;
  }

  const config = getCopyConfig(mode);
  const btn = config.button;
  setLoading(btn, true);
  setStatus(config.status);
  previewEl.style.display = "none";

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "getTranscript",
      mode,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unknown error");
    }

    const textToCopy = config.text(response);

    await navigator.clipboard.writeText(textToCopy);

    const lang = response.trackName ? ` (${response.trackName})` : "";
    setStatus(`${config.success}${lang ? lang : ""}`, "success");

    previewEl.textContent = config.preview(response).slice(0, 300);
    previewEl.style.display = "block";
  } catch (err) {
    // Content script may not be injected yet — inject and retry once
    if (err.message?.includes("Could not establish connection")) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "getTranscript",
          mode,
        });
        if (!response?.ok) throw new Error(response?.error);
        const textToCopy = config.text(response);
        await navigator.clipboard.writeText(textToCopy);
        setStatus(config.success, "success");
        previewEl.textContent = config.preview(response).slice(0, 300);
        previewEl.style.display = "block";
      } catch (retryErr) {
        setStatus(retryErr.message, "error");
      }
    } else {
      setStatus(err.message, "error");
    }
  } finally {
    setLoading(btn, false);
  }
}

copyBtn.addEventListener("click", () => fetchTranscript("plain"));
copyTimestampBtn.addEventListener("click", () => fetchTranscript("timestamps"));
copyAiBtn.addEventListener("click", () => fetchTranscript("ai"));

// Check on open if we're on a video page
getCurrentTab().then((tab) => {
  if (tab?.url?.includes("youtube.com/watch")) {
    setStatus("Ready. Click to copy transcript.");
  }
});

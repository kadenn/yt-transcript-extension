const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const copyBtn = document.getElementById("copyBtn");
const copyTimestampBtn = document.getElementById("copyTimestampBtn");

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = type;
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
  const other = btn === copyBtn ? copyTimestampBtn : copyBtn;
  other.disabled = loading;
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function fetchTranscript(withTimestamps) {
  const tab = await getCurrentTab();

  if (!tab?.url?.includes("youtube.com/watch")) {
    setStatus("Open a YouTube video first.", "error");
    return;
  }

  const btn = withTimestamps ? copyTimestampBtn : copyBtn;
  setLoading(btn, true);
  setStatus("Fetching transcript...");
  previewEl.style.display = "none";

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "getTranscript",
      withTimestamps,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unknown error");
    }

    const textToCopy = withTimestamps
      ? response.timestampText
      : response.text;

    await navigator.clipboard.writeText(textToCopy);

    const lang = response.trackName ? ` (${response.trackName})` : "";
    setStatus(`Copied!${lang}`, "success");

    // Show preview of first ~200 chars
    previewEl.textContent = response.text.slice(0, 300);
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
          withTimestamps,
        });
        if (!response?.ok) throw new Error(response?.error);
        const textToCopy = withTimestamps ? response.timestampText : response.text;
        await navigator.clipboard.writeText(textToCopy);
        setStatus("Copied!", "success");
        previewEl.textContent = response.text.slice(0, 300);
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

copyBtn.addEventListener("click", () => fetchTranscript(false));
copyTimestampBtn.addEventListener("click", () => fetchTranscript(true));

// Check on open if we're on a video page
getCurrentTab().then((tab) => {
  if (tab?.url?.includes("youtube.com/watch")) {
    setStatus("Ready. Click to copy transcript.");
  }
});

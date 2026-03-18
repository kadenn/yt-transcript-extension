function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error("Timed out waiting for: " + selector));
    }, timeout);
  });
}

async function openTranscriptPanel() {
  // If transcript panel is already open and has segments, use it directly
  const existing = document.querySelector("ytd-transcript-segment-renderer");
  if (existing) return;

  // Click "Show more" in description if not already expanded
  const expandBtn = document.querySelector(
    "tp-yt-paper-button#expand, ytd-text-inline-expander #expand-sizer tp-yt-paper-button, #description-inline-expander #expand"
  );
  if (expandBtn) {
    expandBtn.click();
    await wait(400);
  }

  // Find and click "Show transcript" button
  const allButtons = Array.from(
    document.querySelectorAll(
      "ytd-video-description-transcript-section-renderer button, " +
      "yt-button-shape button, " +
      "ytd-button-renderer button"
    )
  );

  const transcriptBtn = allButtons.find((btn) => {
    const text = btn.textContent.trim().toLowerCase();
    return text.includes("transcript") || text.includes("transkript");
  });

  if (!transcriptBtn) throw new Error('Could not find "Show transcript" button. Try opening it manually first.');

  transcriptBtn.click();

  // Wait for segments to render
  await waitForElement("ytd-transcript-segment-renderer", 6000);
  await wait(300); // let all segments paint
}

async function scrapeTranscript() {
  await openTranscriptPanel();

  const segments = document.querySelectorAll("ytd-transcript-segment-renderer");
  if (!segments.length) throw new Error("Transcript panel is empty.");

  const lines = [];
  const timestampLines = [];

  for (const seg of segments) {
    const ts = seg.querySelector(".segment-timestamp")?.textContent?.trim() || "";
    const text = seg.querySelector(".segment-text")?.textContent?.trim() || "";
    if (!text) continue;
    lines.push(text);
    if (ts) timestampLines.push(`[${ts}] ${text}`);
    else timestampLines.push(text);
  }

  if (!lines.length) throw new Error("No transcript text found.");

  return {
    text: lines.join(" "),
    timestampText: timestampLines.join("\n"),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "getTranscript") {
    scrapeTranscript()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

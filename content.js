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

async function tryExpandDescription() {
  // Multiple selectors for different YouTube design versions
  const expandSelectors = [
    // Newer YouTube design (2024-2025)
    "ytd-text-inline-expander tp-yt-paper-button",
    "#description-inline-expander tp-yt-paper-button",
    "#description tp-yt-paper-button",
    // Even newer (no paper elements)
    "ytd-text-inline-expander button",
    "#expand",
    "tp-yt-paper-button#expand",
    "ytd-structured-description-content-renderer tp-yt-paper-button",
    // Generic fallback: any visible "more" button in description area
    "#meta button",
    "#info button",
  ];

  for (const sel of expandSelectors) {
    try {
      const candidates = Array.from(document.querySelectorAll(sel));
      const btn = candidates.find((el) => {
        const text = el.textContent.trim().toLowerCase();
        return (
          text.includes("more") ||
          text.includes("daha") ||
          text.includes("show") ||
          text.includes("expand") ||
          text === "..."
        );
      });
      if (btn && btn.offsetParent !== null) {
        btn.click();
        await wait(600);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function findTranscriptButton() {
  // Ordered from most specific to broadest
  const containerSelectors = [
    "ytd-video-description-transcript-section-renderer",
    "ytd-structured-description-content-renderer",
    "#description",
    "#meta",
    "#secondary",
    "ytd-watch-flexy",
    "body",
  ];

  for (const container of containerSelectors) {
    const root = document.querySelector(container);
    if (!root) continue;

    const buttons = Array.from(
      root.querySelectorAll("button, tp-yt-paper-button, yt-button-shape button")
    );

    const found = buttons.find((btn) => {
      const text = btn.textContent.trim().toLowerCase();
      return (
        text.includes("transcript") ||
        text.includes("transkript") ||
        text.includes("altyazı") ||
        text.includes("subtitle")
      );
    });

    if (found) return found;
  }

  return null;
}

async function openTranscriptPanel() {
  // Already open?
  if (document.querySelector("ytd-transcript-segment-renderer")) return;

  // Try to expand description (don't fail if it doesn't work)
  await tryExpandDescription();

  // Give DOM time to settle after expansion
  await wait(400);

  // Find transcript button
  let transcriptBtn = await findTranscriptButton();

  // If not found after expanding, wait a bit and retry
  if (!transcriptBtn) {
    await wait(800);
    transcriptBtn = await findTranscriptButton();
  }

  if (!transcriptBtn) {
    throw new Error(
      'Could not find "Show transcript" button. The video may not have a transcript, or try scrolling down to the description first.'
    );
  }

  transcriptBtn.click();

  // Wait for transcript segments to appear
  await waitForElement("ytd-transcript-segment-renderer", 8000);
  await wait(400);
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

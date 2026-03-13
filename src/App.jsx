import { useState, useEffect, useRef } from "react";

// ── Move these to utils.js or keep here ──
function hashSubjectId(...) { /* your code */ }
const STUDY_TYPES = { /* your code */ };
function generateFilename(...) { /* your code */ }
const ELECTRODE_SETS = { /* your code + add eye leads */ 
  // Example addition:
  "10-20": [...original, "E1", "E2", "E3", "E4"], // 2L + 2R eye leads
  // Update other sets similarly
};
const MONTAGE_DEFS = { /* update to include eye channels in bipolar/referential */ };
const ANNOTATION_COLORS = [ /* your code */ ];

// ── Improved EDF parse + normalize to 256 Hz ──
function parseAndNormalizeEDF(arrayBuffer) {
  const parsed = parseEDFFile(arrayBuffer); // your existing parser
  if (parsed.error) return { error: parsed.error };

  const targetSr = 256;
  const antiAliasCutoff = targetSr / 2 * 0.9; // ~115 Hz, prevent aliasing

  const normalizedChannels = parsed.channelData.map((chData, idx) => {
    let data = chData;
    const srcSr = parsed.signals[idx]?.sampleRate || parsed.sampleRate;

    // 1. Anti-alias low-pass (simple IIR approx from your applyLowPass)
    data = applyLowPass(data, antiAliasCutoff, srcSr);

    // 2. Resample to 256 Hz (better linear for now; consider sinc later)
    if (srcSr !== targetSr) {
      const ratio = srcSr / targetSr;
      const newLen = Math.round(data.length / ratio);
      const resampled = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) {
        const pos = i * ratio;
        const lo = Math.floor(pos);
        const frac = pos - lo;
        const hi = Math.min(lo + 1, data.length - 1);
        resampled[i] = data[lo] * (1 - frac) + data[hi] * frac;
      }
      data = resampled;
    }
    return data;
  });

  return {
    ...parsed,
    normalizedData: normalizedChannels,
    normalizedSampleRate: targetSr,
    type: 'imported',
    dotColor: 'yellow',
    originalSampleRate: parsed.sampleRate,
    durationSec: parsed.totalDuration,
    channels: parsed.channelLabels,
  };
}

// ── Updated sim generator (lobe-aware + low impedance) ──
function generateSimEEG(channelsCount = 19, durationSec = 30, sampleRate = 256) {
  const data = [];
  // Map channel index to lobe for frequency bias
  const lobeBands = [
    // Frontal beta dominant
    { idx: [0,1,4,5], dominant: 'beta' }, // Fp1,Fp2,F3,F4,...
    // Temporal slower beta
    { idx: [11,12,13,14,15,16], dominant: 'slow_beta' },
    // Parietal high alpha
    { idx: [6,7], dominant: 'high_alpha' },
    // Occipital PDR/alpha
    { idx: [8,9], dominant: 'pdr_alpha' },
    // Add eye leads as small desync artifacts later
  ];

  for (let ch = 0; ch < channelsCount; ch++) {
    // ... adapt your generateEEGSignal with lobe logic ...
    // Example stub:
    let alphaAmp = 12;
    if (lobeBands.some(b => b.idx.includes(ch) && b.dominant === 'high_alpha')) alphaAmp = 25;
    // ... rest similar, add occasional eye blink for EOG channels
    data.push(generateEEGSignal(ch, sampleRate, durationSec, ch)); // your func
  }

  return {
    type: 'test',
    dotColor: 'green',
    normalizedData: data,
    normalizedSampleRate: 256,
    channels: ELECTRODE_SETS["10-20"].slice(0, channelsCount),
    durationSec,
  };
}

// ── Main App ──
export default function ReactEEGApp() {
  const [activeTab, setActiveTab] = useState("library");
  const [records, setRecords] = useState([]); // now with type/dot/normalizedData
  const [currentRecord, setCurrentRecord] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAnnotationPopup, setShowAnnotationPopup] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0); // for playback/annotate

  // ... other states: annotationsMap, edfFileStore, etc.

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e) => {
      if (activeTab !== "review") return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
      if (e.code === "ArrowLeft") {
        // prev epoch or fast scroll if held
      }
      if (e.code === "ArrowRight") {
        // next epoch
      }
      if (e.code === "Enter") {
        setShowAnnotationPopup(true); // open at currentTimeSec
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeTab, isPlaying]);

  // Load library on mount (your Tauri code)
  useEffect(() => {
    // your init + load records, add type/dot if missing
    setRecords(prev => prev.map(r => ({ ...r, type: r.type || 'test', dotColor: r.dotColor || 'green' })));
  }, []);

  // Import handler (rename from Ingest)
  const handleImport = async (file) => {
    const buffer = await file.arrayBuffer();
    const processed = parseAndNormalizeEDF(buffer);
    if (processed.error) return alert(processed.error);

    const newRecord = {
      id: Date.now(),
      filename: file.name,
      ...processed,
      status: "imported",
    };
    setRecords(prev => [...prev, newRecord]);
    setCurrentRecord(newRecord);
    setActiveTab("review");
  };

  // Acquire stop handler → save as acquired
  const handleAcquireStop = (acquiredData) => { // passed from AcquireTab
    const normalized = /* normalize to 256 Hz similar to import */;
    const newRecord = {
      id: Date.now(),
      filename: generateFilename(/* ... */),
      type: 'acquired',
      dotColor: 'blue',
      normalizedData: normalized,
      normalizedSampleRate: 256,
      // ...
    };
    setRecords(prev => [...prev, newRecord]);
  };

  return (
    <div style={{height: "100vh", display: "flex", flexDirection: "column", background: "#080808"}}>
      {/* Header + Tabs - your code, update "Ingest" → "Import" */}

      <div style={{flex: 1, overflow: "hidden"}}>
        {activeTab === "library" && (
          <LibraryTab 
            records={records} 
            onImport={handleImport} 
            onOpenReview={(rec) => { setCurrentRecord(rec); setActiveTab("review"); }}
            // pass dot rendering logic
          />
        )}
        {activeTab === "review" && currentRecord && (
          <ReviewTab 
            record={currentRecord}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            showAnnotationPopup={showAnnotationPopup}
            setShowAnnotationPopup={setShowAnnotationPopup}
            currentTimeSec={currentTimeSec}
            setCurrentTimeSec={setCurrentTimeSec}
            // other props: montage, filters, annotations...
          />
        )}
        {activeTab === "acquire" && (
          <AcquireTab 
            onStop={handleAcquireStop}
            // eye leads in channel selection, etc.
          />
        )}
      </div>
    </div>
  );
}

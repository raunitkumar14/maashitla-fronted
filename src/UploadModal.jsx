import { useState, useRef } from 'react';
import './UploadModal.css';
import { parseCdslFile } from './parseCdslFile';

/*
 * UploadModal is a reusable component — the same UI can represent
 * "Upload NSDL" or "Upload CDSL" just by changing the props passed in.
 *
 * Props:
 *   title      — header text, e.g. "Upload CDSL ISIN Master"
 *   depository — "NSDL" or "CDSL"; controls which parser runs
 *   onClose    — called when X is clicked; parent decides what closing does
 *   onParsed   — (optional) called with the parsed records array once the
 *                file has been read and parsed; only wired up for CDSL today
 */
function UploadModal({ title, depository, onClose, onParsed, passRawFile }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isParsing, setIsParsing]       = useState(false);
  const [parseError, setParseError]     = useState(null);

  const fileInputRef = useRef(null);

  /*
   * processFile — called whenever a file arrives (click-to-browse or drag+drop).
   *
   * WHY FileReader and not fetch()?
   *   fetch() can only load URLs. A File object from an <input> or a drag event
   *   is a local browser object — it has no URL. FileReader is the browser's
   *   dedicated API for reading the *contents* of a locally-selected file as
   *   text, ArrayBuffer, or DataURL. We use readAsText() so the callback
   *   receives a plain string we can split and parse.
   *
   * The read is asynchronous (reader.onload fires when done) because large
   * files could freeze the UI if read synchronously on the main thread.
   */
  function processFile(file) {
    if (!file) return;
    setSelectedFile(file);
    setParseError(null);

    // passRawFile: skip inline parsing and hand the File directly to the parent.
    // Used when the parent owns its own parser (e.g. BenPos CDSL zip).
    if (passRawFile && onParsed) {
      onParsed(file);
      return;
    }

    if (depository === 'NSDL' && onParsed) {
      onParsed(file); // pass raw File/Blob — parseNsdlZip reads it via arrayBuffer()
      return;
    }

    if (depository === 'CDSL' && onParsed) {
      setIsParsing(true);

      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const records = parseCdslFile(e.target.result);
          setIsParsing(false);
          onParsed(records); // hand parsed data up to IsinMaster
        } catch (err) {
          setIsParsing(false);
          setParseError(`Parse failed: ${err.message}`);
        }
      };

      reader.onerror = () => {
        setIsParsing(false);
        setParseError('Could not read file. Please try again.');
      };

      reader.readAsText(file); // reads the whole file as a UTF-8 string
    }
  }

  function handleFileChange(e) {
    processFile(e.target.files[0]);
  }

  function handleDropZoneClick() {
    if (isParsing) return; // ignore clicks while file is being processed
    fileInputRef.current.click();
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDrop(e) {
    e.preventDefault();
    processFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="upload-modal">

      {/* ── Modal header ── */}
      <div className="um-header">
        <span className="um-header-badge">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 1h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
            <polyline points="10,1 10,5 14,5" fill="none" stroke="white" strokeWidth="1"/>
          </svg>
        </span>
        <span className="um-header-title">{title}</span>
        <button
          className="um-close-btn"
          onClick={onClose}
          aria-label="Close"
          disabled={isParsing}
        >
          ×
        </button>
      </div>

      {/* ── Drop zone body ── */}
      <div
        className={`um-body${isParsing ? ' um-body--parsing' : ''}`}
        onClick={handleDropZoneClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isParsing ? (
          /* Loading state — shown while FileReader is running and parseCdslFile executes */
          <div className="um-parsing">
            <div className="um-spinner" />
            <p className="um-parsing-text">Parsing {selectedFile?.name}…</p>
          </div>
        ) : (
          <>
            {/* Cloud upload SVG icon (Feather-style) */}
            <svg
              className="um-cloud-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#555"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>

            <p className="um-drop-text">
              Drag &amp; Drop your <strong>{depository}</strong> file here
            </p>
            <p className="um-browse-text">or click to browse</p>

            {selectedFile && !parseError && (
              <p className="um-filename">📄 {selectedFile.name}</p>
            )}

            {parseError && (
              <p className="um-error">⚠ {parseError}</p>
            )}
          </>
        )}
      </div>

      {/*
       * Hidden file input — never visible, but triggers the OS file picker.
       * Clicking the drop zone calls fileInputRef.current.click() which
       * behaves identically to the user clicking this input directly.
       */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}

export default UploadModal;

import { ChangeEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { getCurrentUser, logout } from "@/lib/auth";
import {
  getCatalog,
  evaluatePackageRefundStatus,
  getInspectionPhotos,
  getPackageItems,
  getPackages,
  markPackageScanned,
  saveInspectionPhoto,
  updateItemCondition,
  updatePackageStatus
} from "@/lib/storage";
import { AppUser, CatalogProduct, InspectionPhoto, PackageItem, PackageSummary } from "@/types/domain";
import { findKnownTrackingNumber, normalizeBarcode, normalizeTrackingNumber, startZxingVideoScan, stopZxingVideoScan } from "@/lib/zxingScanner";

export default function ScannerPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [actualCondition, setActualCondition] = useState("Opened");
  const [expectedCondition, setExpectedCondition] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [isMarkingProcessed, setIsMarkingProcessed] = useState(false);
  const [processedNotice, setProcessedNotice] = useState("");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [expandedRowKey, setExpandedRowKey] = useState("");
  const [focusedRowKey, setFocusedRowKey] = useState("");
  const [itemsForTracking, setItemsForTracking] = useState<PackageItem[]>([]);
  const [activePackage, setActivePackage] = useState<PackageSummary | null>(null);
  const [catalogMap, setCatalogMap] = useState<Record<string, CatalogProduct>>({});
  const [photoByItemId, setPhotoByItemId] = useState<Record<string, InspectionPhoto>>({});
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isLoadingTracking, setIsLoadingTracking] = useState(false);
  const [barcodeCameraOn, setBarcodeCameraOn] = useState(false);
  const [barcodeCameraError, setBarcodeCameraError] = useState("");
  const [trackingCameraOn, setTrackingCameraOn] = useState(false);
  const [trackingCameraError, setTrackingCameraError] = useState("");
  const [evidenceDataUrl, setEvidenceDataUrl] = useState("");
  const [evidencePreview, setEvidencePreview] = useState("");
  const evidenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const trackingVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeScannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const trackingScannerControlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }
    setUser(current);

    getCatalog().then((catalog) => {
      const map: Record<string, CatalogProduct> = {};
      for (const row of catalog) {
        map[row.barcode] = row;
      }
      setCatalogMap(map);
    });
  }, [router]);

  const autoFocusNextItem = useCallback((items: PackageItem[]): void => {
    const next = items.find((item) => !item.actualCondition) || items[0];
    if (!next) {
      setBarcodeInput("");
      setExpectedCondition("");
      setFocusedRowKey("");
      setExpandedRowKey("");
      return;
    }

    const key = makeRowKey(next);
    setBarcodeInput(next.barcode);
    setExpectedCondition(next.expectedCondition || "");
    setFocusedRowKey(key);
    setExpandedRowKey(key);
  }, []);

  const refreshTrackingContext = useCallback(
    async (tracking: string): Promise<void> => {
      setIsLoadingTracking(true);
      try {
        const [items, packages, photos] = await Promise.all([getPackageItems(), getPackages(), getInspectionPhotos()]);
        const normalizedTracking = normalizeTrackingNumber(tracking);
        const filtered = items.filter((item) => normalizeTrackingNumber(item.returnTrackingNumber) === normalizedTracking);
        setItemsForTracking(filtered);

        setSelectedRows(
          filtered.reduce<Record<string, boolean>>((acc, item) => {
            acc[makeRowKey(item)] = false;
            return acc;
          }, {})
        );

        const pkg = packages.find((pkgItem) => normalizeTrackingNumber(pkgItem.returnTrackingNumber) === normalizedTracking) || null;
        setActivePackage(pkg);

        if (pkg?.status === "open") {
          await markPackageScanned(pkg.returnTrackingNumber);
          setActivePackage({ ...pkg, status: "scanned" });
          setStatusNotice(`Package ${pkg.returnTrackingNumber} loaded and marked as scanned. ${filtered.length} item${filtered.length === 1 ? "" : "s"} found.`);
        } else if (pkg?.status === "closed") {
          setStatusNotice("This package is closed. Showing saved details and images.");
        } else if (pkg && filtered.length === 0) {
          setStatusNotice(`Package ${pkg.returnTrackingNumber} is loaded, but has no Package Item records. Upload Package Items before inspection.`);
        } else if (pkg) {
          setStatusNotice(`Package ${pkg.returnTrackingNumber} loaded. ${filtered.length} item${filtered.length === 1 ? "" : "s"} found.`);
        } else {
          setStatusNotice(`No package found for ${tracking}. Check the tracking number or scan the long barcode below 'TRACKING #'.`);
        }

        const photoMap: Record<string, InspectionPhoto> = {};
        for (const photo of photos) {
          if (!photoMap[photo.packageItemId]) {
            photoMap[photo.packageItemId] = photo;
          }
        }
        setPhotoByItemId(photoMap);

        autoFocusNextItem(filtered);
      } finally {
        setIsLoadingTracking(false);
      }
    },
    [autoFocusNextItem]
  );

  useEffect(() => {
    const tracking = trackingInput.trim();
    if (!tracking) {
      setItemsForTracking([]);
      setSelectedRows({});
      setActivePackage(null);
      setBarcodeInput("");
      setExpectedCondition("");
      setFocusedRowKey("");
      setExpandedRowKey("");
      setEvidenceDataUrl("");
      setEvidencePreview("");
      setStatusNotice("");
      setProcessedNotice("");
      stopEvidenceCamera();
      return;
    }

    void refreshTrackingContext(tracking);
  }, [trackingInput, refreshTrackingContext]);

  const focusedItem = useMemo(() => {
    return itemsForTracking.find((item) => makeRowKey(item) === focusedRowKey) || null;
  }, [focusedRowKey, itemsForTracking]);

  const focusedCatalog = focusedItem ? catalogMap[focusedItem.barcode] : null;
  const focusedPhoto = focusedItem?.id ? photoByItemId[focusedItem.id] : undefined;

  useEffect(() => {
    return () => {
      stopEvidenceCamera();
      stopBarcodeCamera();
      stopTrackingCamera();
    };
  }, []);

  async function loadPackage(): Promise<void> {
    const tracking = normalizeTrackingNumber(trackingInput);
    if (!tracking) {
      setStatusNotice("Enter or scan a tracking number first.");
      return;
    }
    setTrackingInput(tracking);
    await refreshTrackingContext(tracking);
  }

  function findMatchingItem(value: string): PackageItem | null {
    const normalized = normalizeBarcode(value);
    return (
      itemsForTracking.find((item) => {
        const candidate = normalizeBarcode(item.barcode);
        return candidate === normalized || candidate.replace(/^0/, "") === normalized.replace(/^0/, "");
      }) || null
    );
  }

  function applyScannedBarcode(value: string): void {
    setBarcodeInput(value);
    const matched = findMatchingItem(value);
    if (matched) {
      const key = makeRowKey(matched);
      setFocusedRowKey(key);
      setExpandedRowKey(key);
      setExpectedCondition(matched.expectedCondition || "");
      setScanMessage(`Barcode ${value} matched to ${matched.title || "package item"}.`);
    } else {
      setExpectedCondition("");
      setScanMessage(`Barcode ${value} scanned, but it is not in this package.`);
    }
  }

  function onBarcodeChange(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    setBarcodeInput(value);

    if (!normalizeBarcode(value)) {
      setExpectedCondition("");
      return;
    }

    const matched = findMatchingItem(value);
    if (matched) {
      const key = makeRowKey(matched);
      setFocusedRowKey(key);
      setExpandedRowKey(key);
      setExpectedCondition(matched.expectedCondition || "");
    }
  }

  async function startBarcodeCamera(): Promise<void> {
    const video = barcodeVideoRef.current;
    if (!video) {
      return;
    }

    try {
      setBarcodeCameraError("");
      const { BarcodeFormat } = await import("@zxing/library");
      const controls = await startZxingVideoScan(
        video,
        [BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE],
        (text) => {
          applyScannedBarcode(text);
          stopBarcodeCamera();
        }
      );
      barcodeScannerControlsRef.current = controls;
      setBarcodeCameraOn(true);
    } catch (error) {
      setBarcodeCameraError(error instanceof Error ? error.message : "Unable to start barcode camera.");
      setBarcodeCameraOn(false);
    }
  }

  function stopBarcodeCamera(): void {
    stopZxingVideoScan(barcodeScannerControlsRef.current, barcodeVideoRef.current);
    barcodeScannerControlsRef.current = null;
    setBarcodeCameraOn(false);
  }

  async function startTrackingCamera(): Promise<void> {
    const video = trackingVideoRef.current;
    if (!video) {
      return;
    }

    try {
      setTrackingCameraError("");
      const { BarcodeFormat } = await import("@zxing/library");
      const controls = await startZxingVideoScan(video, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX], async (text) => {
        const tracking = findKnownTrackingNumber(text, await getPackages());
        if (!tracking) {
          setTrackingCameraError(`Ignored '${text}': it does not match an uploaded package. Aim at the package tracking barcode.`);
          return;
        }

        setTrackingInput(tracking);
        setScanMessage(`Tracking ${tracking} scanned.`);
        stopTrackingCamera();
      });
      trackingScannerControlsRef.current = controls;
      setTrackingCameraOn(true);
    } catch (error) {
      setTrackingCameraError(error instanceof Error ? error.message : "Unable to start tracking camera.");
      setTrackingCameraOn(false);
    }
  }

  function stopTrackingCamera(): void {
    stopZxingVideoScan(trackingScannerControlsRef.current, trackingVideoRef.current);
    trackingScannerControlsRef.current = null;
    setTrackingCameraOn(false);
  }

  function selectItem(item: PackageItem): void {
    const key = makeRowKey(item);
    setFocusedRowKey(key);
    setExpandedRowKey(key);
    setBarcodeInput(item.barcode);
    setExpectedCondition(item.expectedCondition || "");
  }

  function resolveCurrentItem(barcode: string): PackageItem | null {
    if (focusedItem && focusedItem.barcode === barcode) {
      return focusedItem;
    }
    return itemsForTracking.find((item) => item.barcode === barcode) || null;
  }

  async function onEvidenceChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0] || null;
    setCameraError("");
    if (!file) {
      setEvidenceDataUrl("");
      setEvidencePreview("");
      return;
    }
    const preview = await fileToDataUrl(file);
    const compact = await resizeImageDataUrl(preview, 1280, 0.82);
    setEvidenceDataUrl(compact);
    setEvidencePreview(compact);
  }

  async function startEvidenceCamera(): Promise<void> {
    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      const video = evidenceVideoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to access camera";
      setCameraError(message);
      setCameraOn(false);
    }
  }

  function stopEvidenceCamera(): void {
    const video = evidenceVideoRef.current;
    if (!video || !video.srcObject) {
      setCameraOn(false);
      return;
    }

    const stream = video.srcObject as MediaStream;
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    setCameraOn(false);
  }

  function captureEvidenceFromCamera(): void {
    const video = evidenceVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Camera is not ready yet. Try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Unable to capture image from camera.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    void resizeImageDataUrl(dataUrl, 1280, 0.82).then((compact) => {
      setEvidenceDataUrl(compact);
      setEvidencePreview(compact);
    });
    setCameraError("");
  }

  async function markItem(): Promise<void> {
    const tracking = trackingInput.trim();
    const barcode = barcodeInput.trim();
    if (!tracking || !barcode) {
      setScanMessage("Tracking and barcode are required.");
      return;
    }

    try {
      const current = resolveCurrentItem(barcode);
      const mismatch = expectedCondition && expectedCondition !== actualCondition;
      const needsEvidence = actualCondition === "Damaged" || mismatch;

      if (!current?.id) {
        setScanMessage("This barcode is not part of the loaded package.");
        return;
      }

      if (needsEvidence && !evidenceDataUrl) {
        setScanMessage("Upload or capture evidence image for Damaged or mismatch condition before updating.");
        return;
      }

      await updateItemCondition(current.id, actualCondition);
      const refundStatus = await evaluatePackageRefundStatus(tracking);

      if (evidenceDataUrl && current?.id && user) {
        await saveInspectionPhoto(current.id, evidenceDataUrl, user.email);
        setEvidenceDataUrl("");
        setEvidencePreview("");
        stopEvidenceCamera();
      }

      await refreshTrackingContext(tracking);
      setScanMessage(refundStatus === "scanned" ? "Item updated. Package remains scanned until all items are inspected." : `Item updated. Package is ${refundStatus === "ready_for_refund" ? "ready for refund" : "ready for refund review"}.`);
    } catch (error) {
      const message = getErrorMessage(error, "Failed to update item or save evidence.");
      setScanMessage(message);
    }
  }

  async function movePackageToProcessed(): Promise<void> {
    const tracking = trackingInput.trim();
    if (!tracking) {
      setScanMessage("Enter tracking number first.");
      return;
    }
    setIsMarkingProcessed(true);
    setProcessedNotice("");
    try {
      const barcode = barcodeInput.trim();
      const current = barcode ? resolveCurrentItem(barcode) : focusedItem;
      if (evidenceDataUrl && current?.id && user) {
        await saveInspectionPhoto(current.id, evidenceDataUrl, user.email);
      }

      const refundStatus = await evaluatePackageRefundStatus(tracking);
      await refreshTrackingContext(tracking);
      if (evidenceDataUrl && current?.id) {
        setScanMessage(`Package ${refundStatus === "ready_for_refund" ? "is ready for refund" : "needs refund review"}; evidence saved.`);
      } else {
        setScanMessage(`Package ${refundStatus === "ready_for_refund" ? "is ready for refund" : "needs refund review"}.`);
      }
      setProcessedNotice(`Saved: package ${tracking} is now ${refundStatus === "ready_for_refund" ? "Ready for Refund" : refundStatus === "review_for_refund" ? "Review for Refund" : "Scanned"}.`);
      setEvidenceDataUrl("");
      setEvidencePreview("");
      stopEvidenceCamera();
    } finally {
      setIsMarkingProcessed(false);
    }
  }

  function toggleSelectAll(event: ChangeEvent<HTMLInputElement>): void {
    const checked = event.target.checked;
    setSelectedRows(
      itemsForTracking.reduce<Record<string, boolean>>((acc, item) => {
        acc[makeRowKey(item)] = checked;
        return acc;
      }, {})
    );
  }

  function toggleRowSelection(rowKey: string, checked: boolean): void {
    setSelectedRows((prev) => ({
      ...prev,
      [rowKey]: checked
    }));
  }

  async function applyConditionToSelected(): Promise<void> {
    const tracking = trackingInput.trim();
    if (!tracking) {
      setScanMessage("Enter tracking number first.");
      return;
    }

    const selected = itemsForTracking.filter((item) => selectedRows[makeRowKey(item)]);
    if (selected.length === 0) {
      setScanMessage("Select at least one item.");
      return;
    }

    for (const item of selected) {
      if (item.id) {
        await updateItemCondition(item.id, actualCondition);
      }
    }

    const refundStatus = await evaluatePackageRefundStatus(tracking);
    await refreshTrackingContext(tracking);
    setScanMessage(`Updated ${selected.length} selected items. Package is ${refundStatus === "scanned" ? "still scanned" : refundStatus === "ready_for_refund" ? "ready for refund" : "ready for refund review"}.`);
  }

  async function applyConditionToAll(): Promise<void> {
    const tracking = trackingInput.trim();
    if (!tracking) {
      setScanMessage("Enter tracking number first.");
      return;
    }

    if (itemsForTracking.length === 0) {
      setScanMessage("No items found for this package.");
      return;
    }

    for (const item of itemsForTracking) {
      if (item.id) {
        await updateItemCondition(item.id, actualCondition);
      }
    }

    const refundStatus = await evaluatePackageRefundStatus(tracking);
    await refreshTrackingContext(tracking);
    setScanMessage(`Updated all ${itemsForTracking.length} items. Package is ${refundStatus === "ready_for_refund" ? "ready for refund" : "ready for refund review"}.`);
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Scanner and Inspection"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      {statusNotice ? <div className="info-box">{statusNotice}</div> : null}
      {processedNotice ? <div className="success-box">{processedNotice}</div> : null}

      <div className="scanner-fast-layout">
        <article className="panel">
          <h2>Quick Scanner</h2>
          <p className="hint-text">Scan tracking number. Barcode and expected condition auto-fill for next pending item.</p>

          <label htmlFor="trackingInput">Return Tracking Number</label>
          <input
            id="trackingInput"
            placeholder="Scan or type tracking number"
            value={trackingInput}
            onChange={(event) => setTrackingInput(event.target.value)}
            onBlur={() => setTrackingInput((value) => normalizeTrackingNumber(value))}
          />
          <div className="action-row">
            <button className="btn-primary" type="button" onClick={() => void loadPackage()} disabled={isLoadingTracking}>
              {isLoadingTracking ? "Loading..." : "Load Package"}
            </button>
          </div>
          <div className="barcode-scan-box">
            <div className="action-row">
              {!trackingCameraOn ? (
                <button className="btn-secondary" type="button" onClick={() => void startTrackingCamera()}>
                  Scan Tracking
                </button>
              ) : (
                <button className="btn-secondary" type="button" onClick={stopTrackingCamera}>
                  Stop Tracking Scan
                </button>
              )}
            </div>
            <video ref={trackingVideoRef} className={`video-box barcode-scan-video ${trackingCameraOn ? "is-active" : ""}`} muted playsInline />
            {trackingCameraOn ? <p className="hint-text">Scan the package tracking barcode. The scanner matches UPS, FedEx, USPS, and other uploaded carrier tracking values.</p> : null}
            {trackingCameraError ? <p className="error-text">{trackingCameraError}</p> : null}
          </div>

          <details className="package-details" open={Boolean(activePackage)}>
            <summary>Package Details</summary>
            {activePackage ? (
              <div className="package-details-grid">
                <p>
                  <strong>Carrier:</strong> {activePackage.carrier || "-"}
                </p>
                <p>
                  <strong>Order Reference(s):</strong> {activePackage.orderReferences || "-"}
                </p>
                <p>
                  <strong>Earliest Return Requested:</strong> {activePackage.earliestReturnRequested || "-"}
                </p>
              </div>
            ) : (
              <p className="hint-text">No package loaded yet.</p>
            )}
          </details>

          <label htmlFor="barcodeInput">Barcode (EAN/UPC)</label>
          <input id="barcodeInput" placeholder="Barcode auto-fills" value={barcodeInput} onChange={onBarcodeChange} />
          <div className="barcode-scan-box">
            <div className="action-row">
              {!barcodeCameraOn ? (
                <button className="btn-secondary" type="button" onClick={() => void startBarcodeCamera()}>
                  Scan Item Barcode
                </button>
              ) : (
                <button className="btn-secondary" type="button" onClick={stopBarcodeCamera}>
                  Stop Barcode Scan
                </button>
              )}
            </div>
            <video ref={barcodeVideoRef} className={`video-box barcode-scan-video ${barcodeCameraOn ? "is-active" : ""}`} muted playsInline />
            {barcodeCameraOn ? <p className="hint-text">Hold the barcode inside the camera frame. Move closer or farther slowly for faded labels.</p> : null}
            {barcodeCameraError ? <p className="error-text">{barcodeCameraError}</p> : null}
          </div>

          <label htmlFor="expectedCondition">Customer Expected Condition</label>
          <input id="expectedCondition" value={expectedCondition} readOnly />

          <label htmlFor="actualCondition">Actual Condition</label>
          <select id="actualCondition" value={actualCondition} onChange={(event) => setActualCondition(event.target.value)}>
            <option>New</option>
            <option>Opened</option>
            <option>Damaged</option>
          </select>

          <label htmlFor="evidenceUpload">Mismatch/Damaged Evidence Image</label>
          <input id="evidenceUpload" type="file" accept="image/*" onChange={(event) => void onEvidenceChange(event)} />
          <div className="camera-capture-box">
            <video ref={evidenceVideoRef} className="video-box" muted playsInline />
            <div className="action-row">
              {!cameraOn ? (
                <button className="btn-secondary" type="button" onClick={() => void startEvidenceCamera()}>
                  Start Camera
                </button>
              ) : (
                <>
                  <button className="btn-secondary" type="button" onClick={captureEvidenceFromCamera}>
                    Capture Photo
                  </button>
                  <button className="btn-secondary" type="button" onClick={stopEvidenceCamera}>
                    Stop Camera
                  </button>
                </>
              )}
            </div>
            {cameraError ? <p className="error-text">{cameraError}</p> : null}
          </div>

          <div className="action-row">
            <button className="btn-primary" type="button" onClick={markItem}>Update Item</button>
            <button className="btn-secondary" type="button" onClick={() => void applyConditionToSelected()}>Apply to Selected</button>
            <button className="btn-secondary" type="button" onClick={() => void applyConditionToAll()}>Apply to All</button>
            <button className="btn-secondary" type="button" onClick={movePackageToProcessed} disabled={isMarkingProcessed}>
              {isMarkingProcessed ? "Saving..." : "Finalize Refund Status"}
            </button>
          </div>
        </article>

        <article className="panel preview-panel">
          <h2>Item Preview</h2>
          {focusedCatalog?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="product-preview" src={focusedCatalog.imageUrl} alt={focusedItem?.title || "Catalog item"} />
          ) : (
            <div className="product-preview empty">No product image for selected barcode</div>
          )}

          <h3>Damage/Mismatch Evidence</h3>
          {evidencePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="product-preview evidence" src={evidencePreview} alt="Evidence preview" />
          ) : focusedPhoto?.filePath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="product-preview evidence" src={focusedPhoto.filePath} alt="Saved evidence" />
          ) : (
            <div className="product-preview empty evidence">No evidence image yet</div>
          )}

          <p><strong>Barcode:</strong> {focusedItem?.barcode || "-"}</p>
          <p><strong>Artist:</strong> {focusedItem?.artist || focusedCatalog?.artist || "Unknown"}</p>
          <p><strong>Title:</strong> {focusedItem?.title || focusedCatalog?.title || "Not identified"}</p>
        </article>
      </div>

      {scanMessage ? <p className="ok-text">{scanMessage}</p> : null}

      <h2>Expected Items for Package</h2>
      <table className="table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="Select all rows"
                checked={itemsForTracking.length > 0 && itemsForTracking.every((item) => selectedRows[makeRowKey(item)])}
                onChange={toggleSelectAll}
              />
            </th>
            <th>Barcode</th>
            <th>Artist</th>
            <th>Title</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {itemsForTracking.map((item) => {
            const rowKey = makeRowKey(item);
            const product = catalogMap[item.barcode];
            const rowPhoto = item.id ? photoByItemId[item.id] : undefined;
            const isExpanded = expandedRowKey === rowKey;
            const isFocused = focusedRowKey === rowKey;

            return (
              <Fragment key={rowKey}>
                <tr className={isFocused ? "table-row-focus" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedRows[rowKey])}
                      onChange={(event) => toggleRowSelection(rowKey, event.target.checked)}
                      aria-label="Select row"
                    />
                  </td>
                  <td>
                    <button className="row-link-btn" type="button" onClick={() => selectItem(item)}>
                      {item.barcode}
                    </button>
                  </td>
                  <td>{item.artist || product?.artist || "Unknown"}</td>
                  <td>{item.title || product?.title || "Not identified"}</td>
                  <td>{item.expectedCondition}</td>
                  <td>{item.actualCondition || "Pending"}</td>
                  <td>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => setExpandedRowKey(isExpanded ? "" : rowKey)}
                    >
                      {isExpanded ? "Hide" : "Expand"}
                    </button>
                  </td>
                </tr>
                {isExpanded ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="item-expand-box">
                        <p><strong>Qty Expected:</strong> {item.qtyExpected}</p>
                        <p><strong>Customer Return Reason:</strong> {item.customerReturnReason || "-"}</p>
                        <p><strong>Refund Amount:</strong> ${item.refundAmountUsd.toFixed(2)}</p>
                        <p><strong>Order Reference:</strong> {item.orderReference || "-"}</p>
                        <p><strong>Order Date:</strong> {item.orderDate || "-"}</p>
                        <p><strong>Return Requested Date:</strong> {item.returnRequestedDate || "-"}</p>
                        <p><strong>Evidence:</strong> {rowPhoto ? "Available" : "Not uploaded"}</p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </AppLayout>
  );
}

function makeRowKey(item: PackageItem): string {
  return `${item.returnTrackingNumber}_${item.barcode}_${item.orderReference}`;
}

async function fileToDataUrl(file: File, maxDimension = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.onload = () => {
      const rawDataUrl = String(reader.result || "");
      if (!file.type.startsWith("image/")) {
        resolve(rawDataUrl);
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(rawDataUrl);
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width <= maxDimension && height <= maxDimension && file.size < 500 * 1024) {
            resolve(rawDataUrl);
            return;
          }

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

async function resizeImageDataUrl(dataUrl: string, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
      const width = Math.max(1, Math.round(img.width * ratio));
      const height = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

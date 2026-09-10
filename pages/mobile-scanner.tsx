import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getCurrentUser } from "@/lib/auth";
import {
  getCatalog,
  evaluatePackageRefundStatus,
  getInspectionPhotos,
  getPackageItems,
  getPackages,
  markPackageScanned,
  saveInspectionPhoto,
  updateItemCondition
} from "@/lib/storage";
import { AppUser, CatalogProduct, InspectionPhoto, PackageItem, PackageSummary } from "@/types/domain";
import { findKnownTrackingNumber, startZxingVideoScan, stopZxingVideoScan, ZxingControls } from "@/lib/zxingScanner";

type WorkflowStep = "package" | "inspect" | "evidence" | "complete";

const conditions = ["New", "Opened", "Damaged"];

export default function MobileScannerPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [step, setStep] = useState<WorkflowStep>("package");
  const [trackingInput, setTrackingInput] = useState("");
  const [showTrackingSuggestions, setShowTrackingSuggestions] = useState(false);
  const [knownPackages, setKnownPackages] = useState<PackageSummary[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [activePackage, setActivePackage] = useState<PackageSummary | null>(null);
  const [items, setItems] = useState<PackageItem[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogProduct>>({});
  const [photosByItemId, setPhotosByItemId] = useState<Record<string, InspectionPhoto>>({});
  const [selectedItem, setSelectedItem] = useState<PackageItem | null>(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [condition, setCondition] = useState("Opened");
  const [evidenceDataUrl, setEvidenceDataUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [trackingCameraOn, setTrackingCameraOn] = useState(false);
  const [trackingScanNotice, setTrackingScanNotice] = useState("");
  const [barcodeCameraOn, setBarcodeCameraOn] = useState(false);
  const [barcodeScanError, setBarcodeScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackingVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const trackingScannerControlsRef = useRef<ZxingControls | null>(null);
  const barcodeScannerControlsRef = useRef<ZxingControls | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    setUser(currentUser);

    void getCatalog().then((products) => {
      setCatalog(products.reduce<Record<string, CatalogProduct>>((result, product) => {
        result[product.barcode] = product;
        return result;
      }, {}));
    });
    void getPackages().then(setKnownPackages);
  }, [router]);

  useEffect(() => {
    if (!user || !router.isReady) {
      return;
    }
    const queryTracking = router.query.tracking;
    const tracking = Array.isArray(queryTracking) ? queryTracking[0] : queryTracking;
    if (tracking) {
      setTrackingInput(tracking);
      void loadPackage(tracking);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router.isReady]);

  useEffect(() => () => {
    stopCamera();
    stopTrackingCamera();
    stopBarcodeCamera();
  }, []);

  const completedCount = useMemo(() => items.filter((item) => Boolean(item.actualCondition)).length, [items]);
  const focusedProduct = selectedItem ? catalog[selectedItem.barcode] : undefined;

  const trackingSuggestions = useMemo(() => {
    const query = trackingInput.trim().toUpperCase();
    if (query.length < 4) {
      return [];
    }
    return knownPackages
      .filter((pkg) => pkg.returnTrackingNumber.toUpperCase().includes(query))
      .slice(0, 6);
  }, [knownPackages, trackingInput]);

  function selectTrackingSuggestion(tracking: string): void {
    setTrackingInput(tracking);
    setShowTrackingSuggestions(false);
    void loadPackage(tracking);
  }

  const chooseNextItem = useCallback((packageItems: PackageItem[]): void => {
    const nextItem = packageItems.find((item) => !item.actualCondition) || null;
    setSelectedItem(nextItem);
    setBarcodeInput(nextItem?.barcode || "");
    setCondition("Opened");
    setEvidenceDataUrl("");
  }, []);

  async function loadPackage(trackingOverride?: string): Promise<void> {
    const tracking = (trackingOverride || trackingInput).trim();
    if (!tracking) {
      setError("Scan or enter a return tracking number.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const [allPackages, allItems, inspectionPhotos] = await Promise.all([getPackages(), getPackageItems(), getInspectionPhotos()]);
      setKnownPackages(allPackages);
      const packageToInspect = allPackages.find((item) => item.returnTrackingNumber === tracking) || null;
      const packageItems = allItems.filter((item) => item.returnTrackingNumber === tracking);

      if (!packageToInspect || packageItems.length === 0) {
        setError("No return package and items were found for that tracking number.");
        return;
      }

      if (packageToInspect.status === "open") {
        await markPackageScanned(packageToInspect.returnTrackingNumber);
      }
      setActivePackage(packageToInspect.status === "open" ? { ...packageToInspect, status: "scanned" } : packageToInspect);
      setItems(packageItems);
      setPhotosByItemId(inspectionPhotos.reduce<Record<string, InspectionPhoto>>((result, photo) => {
        if (!result[photo.packageItemId]) result[photo.packageItemId] = photo;
        return result;
      }, {}));
      chooseNextItem(packageItems);
      const isComplete = packageItems.every((item) => item.actualCondition);
      setNotice(isComplete ? "Completed package loaded with saved inspection details." : `Package loaded: ${packageItems.length} item${packageItems.length === 1 ? "" : "s"} ready for inspection.`);
      setStep(isComplete ? "complete" : "inspect");
    } finally {
      setIsSaving(false);
    }
  }

  function locateBarcode(value?: string): void {
    const normalized = (value ?? barcodeInput).trim().toLowerCase();
    const item = items.find((candidate) => candidate.barcode.trim().toLowerCase() === normalized) || null;
    if (!item) {
      setError("This barcode is not part of the loaded package.");
      return;
    }
    setError("");
    setSelectedItem(item);
    setCondition(item.actualCondition || "Opened");
    setEvidenceDataUrl("");
  }

  async function startBarcodeCamera(): Promise<void> {
    const video = barcodeVideoRef.current;
    if (!video) {
      return;
    }

    try {
      setBarcodeScanError("");
      const { BarcodeFormat } = await import("@zxing/library");
      const controls = await startZxingVideoScan(
        video,
        [BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE],
        (text) => {
          setBarcodeInput(text);
          locateBarcode(text);
          stopBarcodeCamera();
        }
      );
      barcodeScannerControlsRef.current = controls;
      setBarcodeCameraOn(true);
    } catch {
      setBarcodeScanError("Camera access was unavailable. Enter the barcode manually.");
      setBarcodeCameraOn(false);
    }
  }

  function stopBarcodeCamera(): void {
    stopZxingVideoScan(barcodeScannerControlsRef.current, barcodeVideoRef.current);
    barcodeScannerControlsRef.current = null;
    setBarcodeCameraOn(false);
  }

  async function saveInspection(): Promise<void> {
    if (!selectedItem?.id || !user || !activePackage) {
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await updateItemCondition(selectedItem.id, condition);
      const refundStatus = await evaluatePackageRefundStatus(activePackage.returnTrackingNumber);
      if (evidenceDataUrl && selectedItem.id) {
        await saveInspectionPhoto(selectedItem.id, evidenceDataUrl, user.email);
      }

      const updatedItems = items.map((item) => item === selectedItem ? { ...item, actualCondition: condition } : item);
      setItems(updatedItems);
      const remainingItem = updatedItems.find((item) => !item.actualCondition) || null;
      setNotice(`${selectedItem.barcode} saved as ${condition}.${refundStatus === "scanned" ? " Package remains scanned until all items are inspected." : ` Package is ${refundStatus === "ready_for_refund" ? "ready for refund" : "ready for refund review"}.`}`);
      setEvidenceDataUrl("");

      if (remainingItem) {
        setSelectedItem(remainingItem);
        setBarcodeInput(remainingItem.barcode);
        setCondition("Opened");
        setStep("inspect");
      } else {
        setSelectedItem(null);
        setBarcodeInput("");
        setStep("complete");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the inspection.");
    } finally {
      setIsSaving(false);
    }
  }

  async function completePackage(): Promise<void> {
    if (!activePackage) {
      return;
    }
    if (completedCount !== items.length) {
      setError("Record an actual condition for every package item before completing the package.");
      return;
    }
    setIsSaving(true);
    try {
      const refundStatus = await evaluatePackageRefundStatus(activePackage.returnTrackingNumber);
      setNotice(`${activePackage.returnTrackingNumber} is ${refundStatus === "ready_for_refund" ? "ready for refund" : "ready for refund review"}.`);
      setActivePackage({ ...activePackage, status: refundStatus });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to complete this package.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onEvidenceChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setEvidenceDataUrl(await fileToDataUrl(file));
    setError("");
  }

  async function uploadEvidenceForItem(item: PackageItem, file: File): Promise<void> {
    if (!item.id || !user) {
      return;
    }
    setError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      await saveInspectionPhoto(item.id, dataUrl, user.email);
      const itemId = item.id;
      setPhotosByItemId((prev) => ({
        ...prev,
        [itemId]: { id: itemId, packageItemId: itemId, filePath: dataUrl, uploadedBy: user.email, createdAt: new Date().toISOString() }
      }));
      setNotice(`Evidence photo added for ${item.barcode}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload evidence photo.");
    }
  }

  function goToStep(nextStep: WorkflowStep): void {
    if (nextStep !== "package" && !activePackage) {
      setError("Load a package before opening this step.");
      return;
    }
    stopCamera();
    stopBarcodeCamera();
    setError("");
    setStep(nextStep);
  }

  function selectInspectionItem(item: PackageItem): void {
    setSelectedItem(item);
    setBarcodeInput(item.barcode);
    setCondition(item.actualCondition || "Opened");
    setEvidenceDataUrl("");
  }

  async function startCamera(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOn(true);
    } catch {
      setError("Camera access was unavailable. Select an image instead.");
    }
  }

  function stopCamera(): void {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  async function startTrackingCamera(): Promise<void> {
    const video = trackingVideoRef.current;
    if (!video) {
      return;
    }

    try {
      setError("");
      setTrackingScanNotice("");
      const { BarcodeFormat } = await import("@zxing/library");
      const controls = await startZxingVideoScan(video, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX], async (text) => {
        const tracking = findKnownTrackingNumber(text, await getPackages());
        if (!tracking) {
          setTrackingScanNotice(`Ignored '${text}': it does not match an uploaded package. Aim at the package tracking barcode.`);
          return;
        }
        setTrackingInput(tracking);
        stopTrackingCamera();
        setTrackingScanNotice("Barcode detected. Loading package...");
        void loadPackage(tracking);
      });
      trackingScannerControlsRef.current = controls;
      setTrackingCameraOn(true);
    } catch {
      setError("Camera access was unavailable. Enter the tracking number manually.");
    }
  }

  function stopTrackingCamera(): void {
    stopZxingVideoScan(trackingScannerControlsRef.current, trackingVideoRef.current);
    trackingScannerControlsRef.current = null;
    setTrackingCameraOn(false);
  }

  function captureEvidence(): void {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setEvidenceDataUrl(canvas.toDataURL("image/jpeg", 0.85));
    stopCamera();
    setError("");
  }

  function resetScanner(): void {
    stopCamera();
    setStep("package");
    setTrackingInput("");
    setActivePackage(null);
    setItems([]);
    setPhotosByItemId({});
    setSelectedItem(null);
    setBarcodeInput("");
    setEvidenceDataUrl("");
    setNotice("");
    setError("");
  }

  if (!user) return null;

  return (
    <main className="mobile-scanner-shell">
      <header className="mobile-scanner-header">
        <div>
          <p className="mobile-scanner-kicker">Returns Operations</p>
          <h1>Mobile Scanner</h1>
        </div>
        <button className="mobile-text-button" type="button" onClick={() => router.push("/scanner")}>Desktop</button>
      </header>

      <ol className="mobile-steps" aria-label="Inspection progress">
        {(["package", "inspect", "evidence", "complete"] as WorkflowStep[]).map((stepName, index) => (
          <li key={stepName} className={step === stepName ? "active" : ""}>
            <button type="button" onClick={() => goToStep(stepName)} disabled={stepName !== "package" && !activePackage} aria-label={`Go to step ${index + 1}`}>{index + 1}</button>
          </li>
        ))}
      </ol>

      {notice ? <p className="mobile-notice">{notice}</p> : null}
      {error ? <p className="mobile-error">{error}</p> : null}

      {step === "package" ? (
        <section className="mobile-scanner-stage">
          <p className="mobile-step-label">Step 1 of 4</p>
          <h2>Scan the return label</h2>
          <p>Use a handheld scanner or enter the carrier tracking number.</p>
          <label htmlFor="mobileTracking">Return tracking number</label>
          <input
            id="mobileTracking"
            autoFocus
            autoComplete="off"
            value={trackingInput}
            onChange={(event) => {
              setTrackingInput(event.target.value);
              setShowTrackingSuggestions(true);
            }}
            onFocus={() => setShowTrackingSuggestions(true)}
            onBlur={() => setTimeout(() => setShowTrackingSuggestions(false), 150)}
            onKeyDown={(event) => event.key === "Enter" && void loadPackage()}
          />
          {showTrackingSuggestions && trackingSuggestions.length > 0 ? (
            <ul className="mobile-tracking-suggestions" aria-label="Matching tracking numbers">
              {trackingSuggestions.map((pkg) => (
                <li key={pkg.returnTrackingNumber}>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectTrackingSuggestion(pkg.returnTrackingNumber)}>
                    <span>{pkg.returnTrackingNumber}</span>
                    <small>{pkg.carrier}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <video className="mobile-camera mobile-tracking-camera" ref={trackingVideoRef} muted playsInline />
          {trackingCameraOn ? (
            <div className="mobile-button-row">
              <button className="mobile-secondary-button" type="button" onClick={stopTrackingCamera}>Stop Camera</button>
            </div>
          ) : <button className="mobile-secondary-button" type="button" onClick={() => void startTrackingCamera()}>Open Camera Scanner</button>}
          {trackingScanNotice ? <p className="mobile-scan-notice">{trackingScanNotice}</p> : null}
          <button className="mobile-primary-button" type="button" onClick={() => void loadPackage()} disabled={isSaving}>{isSaving ? "Loading..." : "Load Package"}</button>
        </section>
      ) : null}

      {step === "inspect" && activePackage ? (
        <section className="mobile-scanner-stage">
          <p className="mobile-step-label">Step 2 of 4</p>
          <div className="mobile-package-summary"><strong>{activePackage.returnTrackingNumber}</strong><span>{completedCount} of {items.length} inspected</span></div>
          <h2>Inspect the item</h2>
          <label htmlFor="mobileBarcode">Item barcode</label>
          <input id="mobileBarcode" value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} onBlur={() => locateBarcode()} onKeyDown={(event) => event.key === "Enter" && locateBarcode()} />
          <video className="mobile-camera mobile-barcode-camera" ref={barcodeVideoRef} muted playsInline />
          {barcodeCameraOn ? (
            <div className="mobile-button-row">
              <button className="mobile-secondary-button" type="button" onClick={stopBarcodeCamera}>Stop Camera</button>
            </div>
          ) : <button className="mobile-secondary-button" type="button" onClick={() => void startBarcodeCamera()}>Scan Item Barcode</button>}
          {barcodeScanError ? <p className="mobile-error">{barcodeScanError}</p> : null}
          {selectedItem ? <div className="mobile-item-card"><strong>{selectedItem.title || focusedProduct?.title || "Item"}</strong><span>{selectedItem.artist || focusedProduct?.artist || "Unknown artist"}</span><small>Expected: {selectedItem.expectedCondition || "Not specified"}</small></div> : null}
          <fieldset className="mobile-condition-options"><legend>Actual condition</legend>{conditions.map((option) => <button key={option} type="button" className={condition === option ? "selected" : ""} onClick={() => setCondition(option)}>{option}</button>)}</fieldset>
          <button className="mobile-primary-button" type="button" onClick={() => void saveInspection()} disabled={isSaving || !selectedItem}>{isSaving ? "Saving..." : "Save and Next"}</button>
          <button className="mobile-secondary-button" type="button" onClick={() => goToStep("evidence")} disabled={!selectedItem}>Add Optional Evidence</button>
          <div className="mobile-package-item-list" aria-label="Package items">
            {items.map((item) => {
              const photo = item.id ? photosByItemId[item.id] : undefined;
              return (
                <div key={`${item.barcode}_${item.orderReference}`} className="mobile-item-row">
                  <button type="button" className={selectedItem === item ? "selected" : ""} onClick={() => selectInspectionItem(item)}>
                    <span>{item.title || catalog[item.barcode]?.title || item.barcode}</span>
                    <small>{item.actualCondition ? `Saved: ${item.actualCondition}` : "Pending"}</small>
                  </button>
                  {photo ? (
                    <button type="button" className="mobile-view-image-button" onClick={() => setSelectedImage(photo.filePath)}>
                      View Image
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === "evidence" ? (
        <section className="mobile-scanner-stage">
          <p className="mobile-step-label">Step 3 of 4</p>
          <h2>Add inspection evidence</h2>
          <p>Evidence is optional. Add a photo to the selected item, or continue to the package review.</p>
          {selectedItem ? <div className="mobile-item-card"><strong>{selectedItem.title || catalog[selectedItem.barcode]?.title || selectedItem.barcode}</strong><small>Evidence for: {selectedItem.barcode}</small></div> : <p className="mobile-error">Choose an item in step 2 before adding evidence.</p>}
          <video className="mobile-camera" ref={videoRef} muted playsInline />
          <div className="mobile-button-row">{cameraOn ? <><button className="mobile-secondary-button" type="button" onClick={captureEvidence}>Capture</button><button className="mobile-secondary-button" type="button" onClick={stopCamera}>Stop</button></> : <button className="mobile-secondary-button" type="button" onClick={() => void startCamera()}>Open Camera</button>}</div>
          <label className="mobile-file-label" htmlFor="mobileEvidence">Choose photo<input id="mobileEvidence" type="file" accept="image/*" capture="environment" onChange={(event) => void onEvidenceChange(event)} /></label>
          {evidenceDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mobile-evidence-preview" src={evidenceDataUrl} alt="Inspection evidence preview" />
          ) : null}
          <p className="hint-text">The photo is saved together with the condition when you tap &quot;Save and Next&quot; on the Inspect step.</p>
          <button className="mobile-primary-button" type="button" onClick={() => goToStep("inspect")} disabled={!selectedItem}>Done — Return to Inspect</button>
        </section>
      ) : null}

      {step === "complete" && activePackage ? (
        <section className="mobile-scanner-stage mobile-complete-stage">
          <p className="mobile-step-label">Step 4 of 4</p>
          <h2>{activePackage.status === "ready_for_refund" ? "Ready for refund" : activePackage.status === "review_for_refund" ? "Review for refund" : "Ready to finalize"}</h2>
          <p>{completedCount} of {items.length} items have been recorded.</p>
          <div className="mobile-completed-package-details">
            <p><strong>Tracking:</strong> {activePackage.returnTrackingNumber}</p>
            <p><strong>Carrier:</strong> {activePackage.carrier || "Not recorded"}</p>
            <p><strong>Order reference:</strong> {activePackage.orderReferences || "Not recorded"}</p>
          </div>
          <div className="mobile-completed-items">
            {items.map((item) => {
              const product = catalog[item.barcode];
              const photo = item.id ? photosByItemId[item.id] : undefined;
              return (
                <article className="mobile-completed-item" key={`${item.barcode}_${item.orderReference}`}>
                  {product?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={item.title || product.title || "Product preview"} />
                  ) : <div className="mobile-completed-image-empty">No product image</div>}
                  <div>
                    <strong>{item.title || product?.title || "Item"}</strong>
                    <span>{item.artist || product?.artist || item.barcode}</span>
                    <small>Expected: {item.expectedCondition || "Not specified"}</small>
                    <small>Actual: {item.actualCondition || "Pending"}</small>
                  </div>
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="mobile-completed-evidence" src={photo.filePath} alt={`Evidence for ${item.barcode}`} />
                  ) : (
                    <label className="mobile-evidence-upload" htmlFor={`mobileEvidenceUpload-${item.barcode}-${item.orderReference}`}>
                      No evidence photo
                      <input
                        id={`mobileEvidenceUpload-${item.barcode}-${item.orderReference}`}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadEvidenceForItem(item, file);
                        }}
                      />
                    </label>
                  )}
                </article>
              );
            })}
          </div>
          {!(["ready_for_refund", "review_for_refund", "closed"] as string[]).includes(activePackage.status) ? <button className="mobile-primary-button" type="button" onClick={() => void completePackage()} disabled={isSaving}>{isSaving ? "Syncing..." : "Finalize Refund Status"}</button> : null}
          {!(["ready_for_refund", "review_for_refund", "closed"] as string[]).includes(activePackage.status) && completedCount !== items.length ? <button className="mobile-secondary-button" type="button" onClick={() => goToStep("inspect")}>Return to Items</button> : null}
          <button className="mobile-secondary-button" type="button" onClick={resetScanner}>Scan Another Package</button>
        </section>
      ) : null}

      {selectedImage ? (
        <div className="modal-overlay" onClick={() => setSelectedImage("")}>
          <div className="modal-card image-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Evidence Image</h3>
              <button className="btn-secondary" type="button" onClick={() => setSelectedImage("")}>
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="report-image-large" src={selectedImage} alt="Condition evidence" />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read evidence image."));
    reader.readAsDataURL(file);
  });
}
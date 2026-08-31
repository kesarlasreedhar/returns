import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getCurrentUser } from "@/lib/auth";
import {
  getCatalog,
  getInspectionPhotos,
  getPackageItems,
  getPackages,
  saveInspectionPhoto,
  updateItemCondition,
  updatePackageStatus
} from "@/lib/storage";
import { AppUser, CatalogProduct, InspectionPhoto, PackageItem, PackageSummary } from "@/types/domain";

type WorkflowStep = "package" | "inspect" | "evidence" | "complete";

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};

type WindowWithBarcodeDetector = typeof window & {
  BarcodeDetector?: new () => BarcodeDetectorLike;
};

const conditions = ["New", "Opened", "Damaged"];

export default function MobileScannerPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [step, setStep] = useState<WorkflowStep>("package");
  const [trackingInput, setTrackingInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [activePackage, setActivePackage] = useState<PackageSummary | null>(null);
  const [items, setItems] = useState<PackageItem[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogProduct>>({});
  const [photosByItemId, setPhotosByItemId] = useState<Record<string, InspectionPhoto>>({});
  const [selectedItem, setSelectedItem] = useState<PackageItem | null>(null);
  const [condition, setCondition] = useState("Opened");
  const [evidenceDataUrl, setEvidenceDataUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [trackingCameraOn, setTrackingCameraOn] = useState(false);
  const [trackingScanNotice, setTrackingScanNotice] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackingVideoRef = useRef<HTMLVideoElement | null>(null);

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
  }, [router]);

  useEffect(() => () => {
    stopCamera();
    stopTrackingCamera();
  }, []);

  const completedCount = useMemo(() => items.filter((item) => Boolean(item.actualCondition)).length, [items]);
  const focusedProduct = selectedItem ? catalog[selectedItem.barcode] : undefined;

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
      const packageToInspect = allPackages.find((item) => item.returnTrackingNumber === tracking) || null;
      const packageItems = allItems.filter((item) => item.returnTrackingNumber === tracking);

      if (!packageToInspect || packageItems.length === 0) {
        setError("No return package and items were found for that tracking number.");
        return;
      }

      setActivePackage(packageToInspect);
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

  function locateBarcode(): void {
    const normalized = barcodeInput.trim().toLowerCase();
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

  async function saveInspection(): Promise<void> {
    if (!selectedItem || !user || !activePackage) {
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await updateItemCondition(activePackage.returnTrackingNumber, selectedItem.barcode, condition);
      await updatePackageStatus(activePackage.returnTrackingNumber, "in_processing");
      if (evidenceDataUrl && selectedItem.id) {
        await saveInspectionPhoto(selectedItem.id, evidenceDataUrl, user.email);
      }

      const updatedItems = items.map((item) => item === selectedItem ? { ...item, actualCondition: condition } : item);
      setItems(updatedItems);
      const remainingItem = updatedItems.find((item) => !item.actualCondition) || null;
      setNotice(`${selectedItem.barcode} saved as ${condition}.`);
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
      await updatePackageStatus(activePackage.returnTrackingNumber, "processed");
      setNotice(`${activePackage.returnTrackingNumber} is processed and synchronized.`);
      setActivePackage({ ...activePackage, status: "processed" });
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

  async function saveEvidence(): Promise<void> {
    if (!selectedItem?.id || !user || !evidenceDataUrl) {
      setError("Select an item and add a photo before saving evidence.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await saveInspectionPhoto(selectedItem.id, evidenceDataUrl, user.email);
      setEvidenceDataUrl("");
      setNotice(`Evidence saved for ${selectedItem.barcode}.`);
      setStep("inspect");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save evidence.");
    } finally {
      setIsSaving(false);
    }
  }

  function goToStep(nextStep: WorkflowStep): void {
    if (nextStep !== "package" && !activePackage) {
      setError("Load a package before opening this step.");
      return;
    }
    stopCamera();
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
    try {
      setError("");
      setTrackingScanNotice("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!trackingVideoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      trackingVideoRef.current.srcObject = stream;
      await trackingVideoRef.current.play();
      setTrackingCameraOn(true);
    } catch {
      setError("Camera access was unavailable. Enter the tracking number manually.");
    }
  }

  function stopTrackingCamera(): void {
    const stream = trackingVideoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (trackingVideoRef.current) trackingVideoRef.current.srcObject = null;
    setTrackingCameraOn(false);
  }

  async function scanTrackingBarcode(): Promise<void> {
    const video = trackingVideoRef.current;
    const BarcodeDetectorConstructor = (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!video || !BarcodeDetectorConstructor) {
      setTrackingScanNotice("Barcode detection is not supported by this browser. Enter the tracking number manually.");
      return;
    }
    try {
      const detector = new BarcodeDetectorConstructor();
      const codes = await detector.detect(video);
      const tracking = codes[0]?.rawValue?.trim();
      if (!tracking) {
        setTrackingScanNotice("No barcode found. Hold the label steady and try again.");
        return;
      }
      setTrackingInput(tracking);
      stopTrackingCamera();
      setTrackingScanNotice("Barcode detected. Loading package...");
      void loadPackage(tracking);
    } catch {
      setTrackingScanNotice("Unable to read the barcode. Try again or enter it manually.");
    }
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
          <input id="mobileTracking" autoFocus value={trackingInput} onChange={(event) => setTrackingInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void loadPackage()} />
          <video className="mobile-camera mobile-tracking-camera" ref={trackingVideoRef} muted playsInline />
          {trackingCameraOn ? (
            <div className="mobile-button-row">
              <button className="mobile-secondary-button" type="button" onClick={() => void scanTrackingBarcode()}>Scan Barcode</button>
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
          <input id="mobileBarcode" value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} onBlur={locateBarcode} onKeyDown={(event) => event.key === "Enter" && locateBarcode()} />
          {selectedItem ? <div className="mobile-item-card"><strong>{selectedItem.title || focusedProduct?.title || "Item"}</strong><span>{selectedItem.artist || focusedProduct?.artist || "Unknown artist"}</span><small>Expected: {selectedItem.expectedCondition || "Not specified"}</small></div> : null}
          <fieldset className="mobile-condition-options"><legend>Actual condition</legend>{conditions.map((option) => <button key={option} type="button" className={condition === option ? "selected" : ""} onClick={() => setCondition(option)}>{option}</button>)}</fieldset>
          <button className="mobile-primary-button" type="button" onClick={() => void saveInspection()} disabled={isSaving || !selectedItem}>{isSaving ? "Saving..." : "Save and Next"}</button>
          <button className="mobile-secondary-button" type="button" onClick={() => goToStep("evidence")} disabled={!selectedItem}>Add Optional Evidence</button>
          <div className="mobile-package-item-list" aria-label="Package items">
            {items.map((item) => (
              <button key={`${item.barcode}_${item.orderReference}`} type="button" className={selectedItem === item ? "selected" : ""} onClick={() => selectInspectionItem(item)}>
                <span>{item.title || catalog[item.barcode]?.title || item.barcode}</span>
                <small>{item.actualCondition ? `Saved: ${item.actualCondition}` : "Pending"}</small>
              </button>
            ))}
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
          <button className="mobile-primary-button" type="button" onClick={() => void saveEvidence()} disabled={!evidenceDataUrl || !selectedItem || isSaving}>{isSaving ? "Saving..." : "Save Evidence"}</button>
          <button className="mobile-secondary-button" type="button" onClick={() => goToStep("complete")}>Continue to Review</button>
        </section>
      ) : null}

      {step === "complete" && activePackage ? (
        <section className="mobile-scanner-stage mobile-complete-stage">
          <p className="mobile-step-label">Step 4 of 4</p>
          <h2>{activePackage.status === "processed" ? "Package processed" : "Ready to complete"}</h2>
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
                  ) : <small className="mobile-no-evidence">No evidence photo</small>}
                </article>
              );
            })}
          </div>
          {activePackage.status !== "processed" ? <button className="mobile-primary-button" type="button" onClick={() => void completePackage()} disabled={isSaving}>{isSaving ? "Syncing..." : "Mark Package Processed"}</button> : null}
          {activePackage.status !== "processed" && completedCount !== items.length ? <button className="mobile-secondary-button" type="button" onClick={() => goToStep("inspect")}>Return to Items</button> : null}
          <button className="mobile-secondary-button" type="button" onClick={resetScanner}>Scan Another Package</button>
        </section>
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
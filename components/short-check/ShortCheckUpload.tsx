"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ShortCheckUploadProps {
  onUpload: (file: File) => void;
  isLoading: boolean;
  extractedData?: any;
  onManualSubmit?: (data: any) => void;
}

export default function ShortCheckUpload({
  onUpload,
  isLoading,
  extractedData,
  onManualSubmit,
}: ShortCheckUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual input state
  const [manualData, setManualData] = useState({
    ticker: "",
    cashOnHand: "",
    quarterlyBurnRate: "",
    cashRunway: "",
    float: "",
    marketCap: "",
    outstandingShares: "",
    atmShelfStatus: "",
    debt: "",
    institutionalOwnership: "",
    shortInterest: "",
    recentNews: "",
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFile = (file: File) => {
    // Validate file type
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("Please upload a PNG or JPG image");
      return;
    }

    // Validate file size (4MB max for Vercel serverless function limit)
    if (file.size > 4 * 1024 * 1024) {
      alert("File size must be less than 4MB. Please compress your image or use a smaller screenshot.");
      return;
    }

    setSelectedFile(file);
    onUpload(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handlePaste = useCallback(async (e?: ClipboardEvent) => {
    // Only handle paste when not in manual input mode and not loading
    if (showManualInput || isLoading) return;

    // If called from button click, get clipboard directly
    if (!e) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith("image/")) {
              const blob = await item.getType(type);
              const file = new File([blob], `pasted-image-${Date.now()}.png`, {
                type: type,
              });
              handleFile(file);
              return;
            }
          }
        }
        // If no image found, show message
        alert("No image found in clipboard. Please copy an image first.");
      } catch (err) {
        console.error("Failed to read clipboard:", err);
        alert("Unable to access clipboard. Please use Ctrl+V / Cmd+V to paste, or select an image file.");
      }
      return;
    }

    // Handle paste event
    const items = e.clipboardData?.items;
    if (!items) return;

    // Look for image in clipboard
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          // Convert blob to File object
          const file = new File([blob], `pasted-image-${Date.now()}.png`, {
            type: blob.type || "image/png",
          });
          handleFile(file);
        }
        return;
      }
    }
  }, [showManualInput, isLoading]);

  // Add paste event listener
  useEffect(() => {
    // Only listen for paste when component is mounted and not in manual input mode
    if (!showManualInput) {
      window.addEventListener("paste", handlePaste);
      return () => {
        window.removeEventListener("paste", handlePaste);
      };
    }
  }, [handlePaste, showManualInput]);

  const handleManualSubmit = () => {
    // Convert manual input to ExtractedData format
    const data = {
      ticker: manualData.ticker || undefined,
      cashOnHand: manualData.cashOnHand
        ? parseFloat(manualData.cashOnHand.replace(/[^0-9.]/g, "")) *
          (manualData.cashOnHand.toLowerCase().includes("m") ? 1000000 : 1)
        : undefined,
      quarterlyBurnRate: manualData.quarterlyBurnRate
        ? (() => {
            // Handle both negative (burn) and positive (cash flow) values
            const cleanValue = manualData.quarterlyBurnRate.replace(/[^0-9.-]/g, "");
            const isNegative = cleanValue.startsWith("-") || manualData.quarterlyBurnRate.toLowerCase().includes("burn");
            const numValue = parseFloat(cleanValue.replace("-", "")) *
              (manualData.quarterlyBurnRate.toLowerCase().includes("m")
                ? 1000000
                : 1);
            return isNegative ? -Math.abs(numValue) : Math.abs(numValue);
          })()
        : undefined,
      cashRunway: manualData.cashRunway
        ? parseFloat(manualData.cashRunway)
        : undefined,
      float: manualData.float
        ? parseFloat(manualData.float.replace(/[^0-9.]/g, "")) *
          (manualData.float.toLowerCase().includes("m") ? 1000000 : 1)
        : undefined,
      marketCap: manualData.marketCap
        ? parseFloat(manualData.marketCap.replace(/[^0-9.]/g, "")) *
          (manualData.marketCap.toLowerCase().includes("m") ? 1000000 : 1)
        : undefined,
      outstandingShares: manualData.outstandingShares
        ? parseFloat(manualData.outstandingShares.replace(/[^0-9.]/g, "")) *
          (manualData.outstandingShares.toLowerCase().includes("m")
            ? 1000000
            : 1)
        : undefined,
      atmShelfStatus: manualData.atmShelfStatus || undefined,
      debt: manualData.debt
        ? parseFloat(manualData.debt.replace(/[^0-9.]/g, "")) *
          (manualData.debt.toLowerCase().includes("m") ? 1000000 : 1)
        : undefined,
      institutionalOwnership: manualData.institutionalOwnership
        ? parseFloat(manualData.institutionalOwnership)
        : undefined,
      shortInterest: manualData.shortInterest
        ? parseFloat(manualData.shortInterest)
        : undefined,
      recentNews: manualData.recentNews || undefined,
      confidence: 1.0,
    };

    if (onManualSubmit) {
      onManualSubmit(data);
    }
  };

  // Pre-populate manual input with extracted data if available
  useEffect(() => {
    if (extractedData) {
      // Always update when extractedData changes, whether manual input is shown or not
      setManualData({
        ticker: extractedData.ticker || "",
        cashOnHand: extractedData.cashOnHand
          ? `$${(extractedData.cashOnHand / 1000000).toFixed(2)}M`
          : "",
        quarterlyBurnRate: extractedData.quarterlyBurnRate
          ? `-$${Math.abs(extractedData.quarterlyBurnRate / 1000000).toFixed(2)}M`
          : "",
        cashRunway: extractedData.cashRunway
          ? extractedData.cashRunway.toString()
          : "",
        float: extractedData.float
          ? `${(extractedData.float / 1000000).toFixed(2)}M`
          : "",
        marketCap: extractedData.marketCap
          ? `$${(extractedData.marketCap / 1000000).toFixed(2)}M`
          : "",
        outstandingShares: extractedData.outstandingShares
          ? `${(extractedData.outstandingShares / 1000000).toFixed(2)}M`
          : "",
        atmShelfStatus: extractedData.atmShelfStatus || "",
        debt: extractedData.debt
          ? `$${(extractedData.debt / 1000000).toFixed(2)}M`
          : "",
        institutionalOwnership: extractedData.institutionalOwnership
          ? extractedData.institutionalOwnership.toString()
          : "",
        shortInterest: extractedData.shortInterest
          ? extractedData.shortInterest.toString()
          : "",
        recentNews: extractedData.recentNews || "",
      });
    }
  }, [extractedData]);

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4">Upload Dilution Tracker Screenshot</h2>

      {!showManualInput ? (
        <>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !preview && !isLoading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600"
            } ${isLoading ? "opacity-50 pointer-events-none" : !preview ? "cursor-pointer hover:border-blue-400 dark:hover:border-blue-500" : ""}`}
          >
            {preview ? (
              <div className="space-y-4">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-w-full max-h-96 mx-auto rounded-lg"
                />
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => {
                      setPreview(null);
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    disabled={isLoading}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Drag and drop an image here, or click to select
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-upload"
                />
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="cursor-pointer"
                  >
                    📁 Select Image
                  </Button>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePaste();
                    }}
                    className="cursor-pointer"
                    variant="outline"
                  >
                    📋 Paste Image
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                  💡 Tip: You can also paste with Ctrl+V / Cmd+V
                </p>
              </>
            )}
          </div>

          {isLoading && (
            <div className="mt-4 text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-blue-600 dark:text-blue-400 font-medium">
                ⏳ Processing image with OCR... This may take 10-30 seconds.
              </p>
              <div className="mt-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
              </div>
            </div>
          )}

          <div className="mt-4 text-center">
            <button
              onClick={() => setShowManualInput(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Or enter data manually
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Manual Data Entry</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Ticker</label>
              <Input
                value={manualData.ticker}
                onChange={(e) =>
                  setManualData({ ...manualData, ticker: e.target.value })
                }
                placeholder="MSAI"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Cash on Hand
              </label>
              <Input
                value={manualData.cashOnHand}
                onChange={(e) =>
                  setManualData({ ...manualData, cashOnHand: e.target.value })
                }
                placeholder="$2.4M"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Quarterly Burn Rate (negative) or Cash Flow (positive)
              </label>
              <Input
                value={manualData.quarterlyBurnRate}
                onChange={(e) =>
                  setManualData({
                    ...manualData,
                    quarterlyBurnRate: e.target.value,
                  })
                }
                placeholder="-$1.99M or +$0.5M"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Use negative for burn rate (e.g., -$1.99M) or positive for cash flow (e.g., +$0.5M)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Cash Runway (months)
              </label>
              <Input
                value={manualData.cashRunway}
                onChange={(e) =>
                  setManualData({ ...manualData, cashRunway: e.target.value })
                }
                placeholder="3.7"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Float</label>
              <Input
                value={manualData.float}
                onChange={(e) =>
                  setManualData({ ...manualData, float: e.target.value })
                }
                placeholder="17.72M"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Market Cap
              </label>
              <Input
                value={manualData.marketCap}
                onChange={(e) =>
                  setManualData({ ...manualData, marketCap: e.target.value })
                }
                placeholder="$77.9M"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Outstanding Shares
              </label>
              <Input
                value={manualData.outstandingShares}
                onChange={(e) =>
                  setManualData({
                    ...manualData,
                    outstandingShares: e.target.value,
                  })
                }
                placeholder="41.42M"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                ATM/Shelf Status
              </label>
              <Input
                value={manualData.atmShelfStatus}
                onChange={(e) =>
                  setManualData({
                    ...manualData,
                    atmShelfStatus: e.target.value,
                  })
                }
                placeholder="ATM Active"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Debt</label>
              <Input
                value={manualData.debt}
                onChange={(e) =>
                  setManualData({ ...manualData, debt: e.target.value })
                }
                placeholder="$5M"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Institutional Ownership (%)
              </label>
              <Input
                value={manualData.institutionalOwnership}
                onChange={(e) =>
                  setManualData({
                    ...manualData,
                    institutionalOwnership: e.target.value,
                  })
                }
                placeholder="35.8"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Short Interest (%)
              </label>
              <Input
                value={manualData.shortInterest}
                onChange={(e) =>
                  setManualData({
                    ...manualData,
                    shortInterest: e.target.value,
                  })
                }
                placeholder="0.6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Recent News
              </label>
              <Input
                value={manualData.recentNews}
                onChange={(e) =>
                  setManualData({ ...manualData, recentNews: e.target.value })
                }
                placeholder="None or headline"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleManualSubmit} 
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Calculate Rating
            </Button>
            <Button
              onClick={() => setShowManualInput(false)}
              className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
            >
              Cancel
            </Button>
          </div>
          {!manualData.ticker && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
              ⚠️ Ticker is recommended but not required
            </p>
          )}
        </div>
      )}
    </Card>
  );
}


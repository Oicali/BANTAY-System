import { useState } from "react";
import html2canvas from "html2canvas";

const API = `${import.meta.env.VITE_API_URL}/crime-dashboard`;
const getToken = () => localStorage.getItem("token");

async function captureElement(ref) {
  if (!ref?.current) return null;
  try {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const canvas = await html2canvas(ref.current, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL("image/png").split(",")[1];
  } catch (err) {
    console.warn("[useExportDashboard] captureElement failed:", err);
    return null;
  }
}

export function useExportDashboard(
  dashData,
  appliedFilters,
  chartRefs = {},
  setIsExportLoading,
  assessment = null,
  analysisData = null,
) {
  const [isExporting, setIsExporting] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);   // ← add this

  const closePreview = () => {
    pdfPreview?.revoke();
    setPdfPreview(null);
  };

  const exportDoc = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setIsExportLoading?.(true);

    try {
      const imgTrends  = await captureElement(chartRefs.trends);
      const imgClock   = await captureElement(chartRefs.clock);
      const imgByDay   = await captureElement(chartRefs.byDay);
      const imgModus   = await captureElement(chartRefs.modus);
      const imgPlace   = await captureElement(chartRefs.place);
      const imgBarangay = await captureElement(chartRefs.barangay);

      const payload = {
        summary:      dashData.summary      ?? [],
        trends:       dashData.trends       ?? [],
        hourly:       dashData.hourly       ?? [],
        byDay:        dashData.byDay        ?? [],
        place:        dashData.place        ?? [],
        barangay:     dashData.barangay     ?? [],
        modus:        dashData.modus        ?? [],
        completeData: dashData.completeData ?? [],
        assessment:   assessment   ?? null,
        analysisData: analysisData ?? null,
        meta: {
          dateFrom:   appliedFilters.dateFrom   ?? null,
          dateTo:     appliedFilters.dateTo     ?? null,
          crimeTypes: appliedFilters.crimeTypes ?? [],
          barangays:  appliedFilters.barangays  ?? [],
        },
        images: {
          trends:   imgTrends,
          clock:    imgClock,
          byDay:    imgByDay,
          modus:    imgModus,
          place:    imgPlace,
          barangay: imgBarangay,
        },
      };

      const response = await fetch(`${API}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Export failed" }));
        throw new Error(err.message || "Export failed");
      }

      const dateStr = appliedFilters.dateFrom && appliedFilters.dateTo
        ? `${appliedFilters.dateFrom}_to_${appliedFilters.dateTo}`
        : new Date().toISOString().slice(0, 10);
      const filename = `crime_dashboard_${dateStr}.pdf`;

      const blob = await response.blob();
      const file = new File([blob], filename, { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(file);

      setPdfPreview({
        blobUrl,
        download: () => {
          const link = document.createElement("a");
          link.href     = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
        },
        revoke: () => URL.revokeObjectURL(blobUrl),
      });

    } catch (err) {
      console.error("[useExportDashboard] error:", err);
      alert(err.message || "Failed to export dashboard");
    } finally {
      setIsExporting(false);
      setIsExportLoading?.(false);
    }
  };

  return { exportDoc, isExporting, pdfPreview, closePreview };
}
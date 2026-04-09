// frontend/src/hooks/useExportDashboard.js
import { useState } from "react";
import html2canvas from "html2canvas";

const API = `${import.meta.env.VITE_API_URL}/crime-dashboard`;
const getToken = () => localStorage.getItem("token");

/**
 * Captures a DOM element as a base64 PNG string.
 * Waits 800ms first to let Recharts animations finish.
 * Returns null if the element is missing or capture fails.
 */
async function captureElement(ref) {
  if (!ref?.current) return null;
  try {
    // Wait for chart animations to complete before screenshotting
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

/**
 * @param {object} dashData        – live dashboard data
 * @param {object} appliedFilters  – currently applied filter state
 * @param {object} chartRefs       – { caseStatus, trends, clock, byDay, modus, place, barangay }
 * @param {function} setIsExportLoading – setter from CrimeDashboard to show loading modal
 */
export function useExportDashboard(
  dashData,
  appliedFilters,
  chartRefs = {},
  setIsExportLoading,
) {
  const [isExporting, setIsExporting] = useState(false);

  const exportDoc = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setIsExportLoading?.(true);

    try {
      // ── Capture all charts sequentially so the 800ms delay per chart
      //    doesn't overlap and cause partial renders ───────────────────
      const imgTrends = await captureElement(chartRefs.trends);
      const imgClock = await captureElement(chartRefs.clock);
      const imgByDay = await captureElement(chartRefs.byDay);
      const imgModus = await captureElement(chartRefs.modus);
      const imgPlace = await captureElement(chartRefs.place);
      const imgBarangay = await captureElement(chartRefs.barangay);

      const payload = {
        summary: dashData.summary ?? [],
        trends: dashData.trends ?? [],
        hourly: dashData.hourly ?? [],
        byDay: dashData.byDay ?? [],
        place: dashData.place ?? [],
        barangay: dashData.barangay ?? [],
        modus: dashData.modus ?? [],
        completeData: dashData.completeData ?? [], // ← add this
        meta: {
          dateFrom: appliedFilters.dateFrom ?? null,
          dateTo: appliedFilters.dateTo ?? null,
          crimeTypes: appliedFilters.crimeTypes ?? [],
          barangays: appliedFilters.barangays ?? [],
        },
        images: {
          // caseStatus removed
          trends: imgTrends,
          clock: imgClock,
          byDay: imgByDay,
          modus: imgModus,
          place: imgPlace,
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
        const err = await response
          .json()
          .catch(() => ({ message: "Export failed" }));
        throw new Error(err.message || "Export failed");
      }

      const blob = await response.blob();
      const dateStr =
        appliedFilters.dateFrom && appliedFilters.dateTo
          ? `${appliedFilters.dateFrom}_to_${appliedFilters.dateTo}`
          : new Date().toISOString().slice(0, 10);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `crime_dashboard_${dateStr}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[useExportDashboard] error:", err);
      alert(err.message || "Failed to export dashboard");
    } finally {
      setIsExporting(false);
      setIsExportLoading?.(false);
    }
  };

  return { exportDoc, isExporting };
}

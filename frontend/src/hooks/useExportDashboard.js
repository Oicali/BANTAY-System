// frontend/src/hooks/useExportDashboard.js
import { useState } from "react";
import html2canvas from "html2canvas";

const API = `${import.meta.env.VITE_API_URL}/crime-dashboard`;
const getToken = () => localStorage.getItem("token");

/**
 * Captures a DOM element as a base64 PNG string.
 * Returns null if the element is missing or capture fails.
 */
async function captureElement(ref) {
  if (!ref?.current) return null;
  try {
    const canvas = await html2canvas(ref.current, {
      backgroundColor: "#ffffff",
      scale: 2,           // retina quality
      useCORS: true,
      logging: false,
    });
    // strip the "data:image/png;base64," prefix — backend only wants the raw b64
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
 *                                   each value is a React ref attached to a chart wrapper div
 */
export function useExportDashboard(dashData, appliedFilters, chartRefs = {}) {
  const [isExporting, setIsExporting] = useState(false);

  const exportDoc = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      // ── Capture all charts in parallel ──────────────────────────────────
      const [
        imgCaseStatus,
        imgTrends,
        imgClock,
        imgByDay,
        imgModus,
        imgPlace,
        imgBarangay,
      ] = await Promise.all([
        captureElement(chartRefs.caseStatus),
        captureElement(chartRefs.trends),
        captureElement(chartRefs.clock),
        captureElement(chartRefs.byDay),
        captureElement(chartRefs.modus),
        captureElement(chartRefs.place),
        captureElement(chartRefs.barangay),
      ]);

      const payload = {
        summary:  dashData.summary  ?? [],
        trends:   dashData.trends   ?? [],
        hourly:   dashData.hourly   ?? [],
        byDay:    dashData.byDay    ?? [],
        place:    dashData.place    ?? [],
        barangay: dashData.barangay ?? [],
        modus:    dashData.modus    ?? [],
        meta: {
          dateFrom:   appliedFilters.dateFrom   ?? null,
          dateTo:     appliedFilters.dateTo     ?? null,
          crimeTypes: appliedFilters.crimeTypes ?? [],
          barangays:  appliedFilters.barangays  ?? [],
        },
        // chart screenshots — null entries are gracefully skipped by the backend
        images: {
          caseStatus:  imgCaseStatus,
          trends:      imgTrends,
          clock:       imgClock,
          byDay:       imgByDay,
          modus:       imgModus,
          place:       imgPlace,
          barangay:    imgBarangay,
        },
      };

      const response = await fetch(`${API}/export`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Export failed" }));
        throw new Error(err.message || "Export failed");
      }

      const blob    = await response.blob();
      const dateStr =
        appliedFilters.dateFrom && appliedFilters.dateTo
          ? `${appliedFilters.dateFrom}_to_${appliedFilters.dateTo}`
          : new Date().toISOString().slice(0, 10);

      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
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
    }
  };

  return { exportDoc, isExporting };
}
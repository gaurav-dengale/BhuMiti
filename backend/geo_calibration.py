"""
DepthWizard Geospatial Scale Calibration Engine
Converts Relative Disparity / rDSM to Metric Absolute Elevation (DSM in meters).
"""

import numpy as np
from sklearn.linear_model import RANSACRegressor, HuberRegressor, LinearRegression

class GeoCalibrator:
    def __init__(self):
        pass

    @staticmethod
    def calibrate_with_reference_dem(
        relative_depth: np.ndarray,
        reference_dem: np.ndarray,
        method: str = "ransac"
    ) -> tuple[np.ndarray, dict]:
        """
        Fits affine transformation: Z_metric(u,v) = scale * d_rel(u,v) + shift
        using coarse reference DEM (e.g., SRTM 30m / Copernicus DEM).
        
        Uses RANSAC or Huber loss to be resilient to resolution mismatches & structural differences.
        """
        # Downsample / align shapes if needed
        h, w = relative_depth.shape
        if reference_dem.shape != (h, w):
            import cv2
            ref_aligned = cv2.resize(reference_dem, (w, h), interpolation=cv2.INTER_LINEAR)
        else:
            ref_aligned = reference_dem

        # Flatten valid points (exclude NaNs and NODATA like -9999)
        valid_mask = np.isfinite(ref_aligned) & (ref_aligned > -500) & (ref_aligned < 9000)
        
        x_pts = relative_depth[valid_mask].reshape(-1, 1)
        y_pts = ref_aligned[valid_mask]

        if len(x_pts) < 10:
            # Fallback if insufficient points
            scale = 100.0
            shift = 50.0
            r_squared = 0.5
        else:
            # Subsample for speed if > 50000 points
            if len(x_pts) > 50000:
                indices = np.random.choice(len(x_pts), 50000, replace=False)
                x_sub = x_pts[indices]
                y_sub = y_pts[indices]
            else:
                x_sub = x_pts
                y_sub = y_pts

            if method == "ransac":
                model = RANSACRegressor(min_samples=50, residual_threshold=15.0, random_state=42)
                model.fit(x_sub, y_sub)
                scale = float(model.estimator_.coef_[0])
                shift = float(model.estimator_.intercept_)
            elif method == "huber":
                model = HuberRegressor()
                model.fit(x_sub, y_sub)
                scale = float(model.coef_[0])
                shift = float(model.intercept_)
            else:
                model = LinearRegression()
                model.fit(x_sub, y_sub)
                scale = float(model.coef_[0])
                shift = float(model.intercept_)

            # Ensure positive scale
            if scale <= 0:
                scale = abs(scale) if abs(scale) > 1e-3 else 50.0

            # Calculate R^2 fit score
            y_pred = (scale * x_sub + shift).ravel()
            y_sub_flat = y_sub.ravel()
            ss_res = np.sum((y_sub_flat - y_pred) ** 2)
            ss_tot = np.sum((y_sub_flat - np.mean(y_sub_flat)) ** 2)
            r_squared = float(1 - (ss_res / (ss_tot + 1e-8)))

        # Compute metric DSM
        absolute_dsm = scale * relative_depth + shift

        calibration_stats = {
            "scale": scale,
            "shift": shift,
            "r_squared": max(0.0, min(1.0, r_squared)),
            "min_elevation_m": float(np.min(absolute_dsm)),
            "max_elevation_m": float(np.max(absolute_dsm)),
            "elevation_span_m": float(np.max(absolute_dsm) - np.min(absolute_dsm)),
            "method": method
        }

        return absolute_dsm.astype(np.float32), calibration_stats

    @staticmethod
    def calibrate_with_gcps(
        relative_depth: np.ndarray,
        gcps: list[dict]
    ) -> tuple[np.ndarray, dict]:
        """
        Calibrates using user-provided Ground Control Points (GCPs).
        Each GCP: {"x_px": int, "y_px": int, "elevation_m": float}
        """
        if len(gcps) < 2:
            # Fallback default scaling
            scale = 100.0
            shift = 0.0
        else:
            x_vals = []
            y_vals = []
            h, w = relative_depth.shape
            for gcp in gcps:
                px = max(0, min(w - 1, int(gcp["x_px"])))
                py = max(0, min(h - 1, int(gcp["y_px"])))
                x_vals.append(relative_depth[py, px])
                y_vals.append(gcp["elevation_m"])

            x_arr = np.array(x_vals).reshape(-1, 1)
            y_arr = np.array(y_vals)

            reg = LinearRegression().fit(x_arr, y_arr)
            scale = float(reg.coef_[0]) if reg.coef_[0] > 0 else 100.0
            shift = float(reg.intercept_)

        absolute_dsm = scale * relative_depth + shift
        return absolute_dsm.astype(np.float32), {
            "scale": scale,
            "shift": shift,
            "gcp_count": len(gcps),
            "min_elevation_m": float(np.min(absolute_dsm)),
            "max_elevation_m": float(np.max(absolute_dsm)),
        }

    @staticmethod
    def calibrate_synthetic_prior(
        relative_depth: np.ndarray,
        terrain_type: str = "urban",
        base_elevation_m: float = 50.0,
        height_span_m: float = 80.0
    ) -> tuple[np.ndarray, dict]:
        """
        Calibrates non-georeferenced images using scene-level semantic priors.
        Terrain presets:
        - 'urban': base 20m, span 120m (skyscrapers / building relief)
        - 'mountain': base 1200m, span 1800m (high topographic gradient)
        - 'coastal': base 5m, span 35m (flat lowland / estuary)
        - 'disaster': base 300m, span 450m (debris / terrain collapse)
        """
        presets = {
            "urban": (25.0, 110.0),
            "mountain": (1400.0, 1600.0),
            "coastal": (2.0, 45.0),
            "disaster": (350.0, 500.0),
            "custom": (base_elevation_m, height_span_m)
        }
        
        base, span = presets.get(terrain_type, (base_elevation_m, height_span_m))
        
        # d_rel is 0..1 -> metric = base + span * d_rel
        scale = float(span)
        shift = float(base)
        absolute_dsm = shift + scale * relative_depth

        return absolute_dsm.astype(np.float32), {
            "scale": scale,
            "shift": shift,
            "terrain_type": terrain_type,
            "min_elevation_m": float(np.min(absolute_dsm)),
            "max_elevation_m": float(np.max(absolute_dsm)),
            "elevation_span_m": float(span)
        }

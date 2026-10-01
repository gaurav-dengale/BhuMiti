"""
BhuMiti Accuracy Validation & Geospatial Metrics Suite
Calculates RMSE, MAE, R^2, Mean Bias Error, and structural height deviations.
"""

import numpy as np

class AccuracyValidator:
    @staticmethod
    def evaluate(pred_dsm: np.ndarray, reference_dem: np.ndarray) -> dict:
        """
        Evaluates predicted DSM against ground truth LiDAR / Reference DEM.
        Returns detailed statistical accuracy metrics and difference map.
        """
        if pred_dsm.shape != reference_dem.shape:
            import cv2
            ref_aligned = cv2.resize(
                reference_dem,
                (pred_dsm.shape[1], pred_dsm.shape[0]),
                interpolation=cv2.INTER_LINEAR
            )
        else:
            ref_aligned = reference_dem

        # Valid mask
        valid_mask = np.isfinite(pred_dsm) & np.isfinite(ref_aligned) & (ref_aligned > -500) & (ref_aligned < 9000)
        
        if np.sum(valid_mask) == 0:
            return {"error": "No valid overlapping pixels between prediction and reference"}

        p = pred_dsm[valid_mask]
        r = ref_aligned[valid_mask]

        diff = p - r
        abs_diff = np.abs(diff)

        # Root Mean Square Error (RMSE)
        rmse = float(np.sqrt(np.mean(diff ** 2)))
        
        # Mean Absolute Error (MAE)
        mae = float(np.mean(abs_diff))
        
        # Median Absolute Error (MedAE)
        medae = float(np.median(abs_diff))
        
        # Mean Bias Error (MBE)
        mbe = float(np.mean(diff))

        # Linear Pearson Correlation (r) & Coefficient of Determination (R^2)
        r_corr = float(np.corrcoef(p, r)[0, 1]) if len(p) > 1 else 0.0
        
        ss_res = np.sum(diff ** 2)
        ss_tot = np.sum((r - np.mean(r)) ** 2)
        r2 = float(1.0 - (ss_res / (ss_tot + 1e-8)))

        # Height error percentiles (LE90, LE95 - Linear Error at 90% and 95% confidence)
        le90 = float(np.percentile(abs_diff, 90))
        le95 = float(np.percentile(abs_diff, 95))

        # Slope & Structural standard deviation
        pred_grad = np.gradient(pred_dsm)
        ref_grad = np.gradient(ref_aligned)
        slope_pred = np.arctan(np.sqrt(pred_grad[0]**2 + pred_grad[1]**2)) * (180.0 / np.pi)
        slope_ref = np.arctan(np.sqrt(ref_grad[0]**2 + ref_grad[1]**2)) * (180.0 / np.pi)
        slope_rmse = float(np.sqrt(np.mean((slope_pred[valid_mask] - slope_ref[valid_mask]) ** 2)))

        # 2D Difference map (clipped for visualization)
        diff_map = np.zeros_like(pred_dsm, dtype=np.float32)
        diff_map[valid_mask] = abs_diff

        return {
            "metrics": {
                "rmse_m": round(rmse, 3),
                "mae_m": round(mae, 3),
                "medae_m": round(medae, 3),
                "mbe_m": round(mbe, 3),
                "le90_m": round(le90, 3),
                "le95_m": round(le95, 3),
                "pearson_r": round(r_corr, 4),
                "r2_score": round(max(0.0, min(1.0, r2)), 4),
                "slope_rmse_deg": round(slope_rmse, 2),
                "valid_pixel_count": int(np.sum(valid_mask)),
                "accuracy_grade": "A+" if rmse < 2.5 else "A" if rmse < 5.0 else "B" if rmse < 10.0 else "C"
            },
            "diff_map_stats": {
                "min_err": float(np.min(abs_diff)),
                "max_err": float(np.max(abs_diff)),
                "p50_err": float(np.percentile(abs_diff, 50)),
                "p90_err": float(np.percentile(abs_diff, 90))
            }
        }

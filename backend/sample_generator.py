"""
BhuMiti Synthetic Remote Sensing Sample Generator
Generates realistic multi-terrain aerial scenes with corresponding Ground Truth DEMs.
"""

import numpy as np
import cv2

class SampleDatasetGenerator:
    @staticmethod
    def generate_urban_scene(width: int = 512, height: int = 512) -> tuple[np.ndarray, np.ndarray, dict]:
        """
        Generates Urban Metropolitan scenario with skyscrapers, gridded streets, and ground-truth heights.
        """
        np.random.seed(42)
        # Base terrain height ~ 20m
        gt_dem = np.full((height, width), 20.0, dtype=np.float32)
        rgb = np.zeros((height, width, 3), dtype=np.uint8)
        
        # Ground asphalt texture
        rgb[:, :] = [45, 52, 54]

        # Street grid
        block_size = 64
        street_width = 10
        for y in range(0, height, block_size):
            cv2.line(rgb, (0, y), (width, y), (80, 85, 90), street_width)
        for x in range(0, width, block_size):
            cv2.line(rgb, (x, 0), (x, height), (80, 85, 90), street_width)

        # Buildings
        for y in range(street_width + 4, height - block_size, block_size):
            for x in range(street_width + 4, width - block_size, block_size):
                bw = np.random.randint(24, block_size - street_width - 6)
                bh = np.random.randint(24, block_size - street_width - 6)
                # Building height between 15m and 120m
                b_height = np.random.uniform(25.0, 115.0)
                
                gt_dem[y:y+bh, x:x+bw] = 20.0 + b_height
                
                # Roof color
                colors = [
                    (210, 218, 226), (178, 190, 195), (99, 110, 114), 
                    (225, 112, 85), (116, 185, 255), (85, 239, 196)
                ]
                roof_color = colors[np.random.randint(0, len(colors))]
                rgb[y:y+bh, x:x+bw] = roof_color
                # Roof border / AC units
                cv2.rectangle(rgb, (x, y), (x+bw, y+bh), (30, 39, 46), 1)
                if bw > 30 and bh > 30:
                    cv2.rectangle(rgb, (x+6, y+6), (x+14, y+14), (100, 100, 100), -1)

        # Add slight natural terrain noise
        noise = np.random.normal(0, 0.4, (height, width)).astype(np.float32)
        gt_dem += noise

        metadata = {
            "name": "ISRO Urban Center (Metropolitan Area)",
            "type": "urban",
            "description": "High-density urban area with multi-story complexes, street networks, and structural height variation (20m - 135m).",
            "bounds": {"west": 72.825, "east": 72.845, "south": 18.920, "north": 18.940},
            "crs": "EPSG:4326 (WGS84)",
            "ground_truth_min": float(np.min(gt_dem)),
            "ground_truth_max": float(np.max(gt_dem))
        }

        return rgb, gt_dem, metadata

    @staticmethod
    def generate_mountain_scene(width: int = 512, height: int = 512) -> tuple[np.ndarray, np.ndarray, dict]:
        """
        Generates Himalayan Mountain Ridge scenario with steep slopes and snow caps.
        """
        np.random.seed(101)
        x = np.linspace(-3, 3, width)
        y = np.linspace(-3, 3, height)
        xx, yy = np.meshgrid(x, y)

        # Multi-octave mountain terrain function
        r1 = np.sqrt(xx**2 + yy**2)
        ridge1 = np.cos(xx * 2.0 + yy * 1.5) * 400.0
        ridge2 = np.sin(xx * 4.0 - yy * 3.0) * 200.0
        peak = np.exp(-0.3 * (xx**2 + (yy - 0.5)**2)) * 1200.0
        
        gt_dem = 1500.0 + peak + ridge1 + ridge2 + np.random.normal(0, 5.0, (height, width)).astype(np.float32)
        gt_dem = np.maximum(gt_dem, 1400.0)

        # Colormap satellite texture based on elevation and slope
        norm_h = (gt_dem - np.min(gt_dem)) / (np.max(gt_dem) - np.min(gt_dem))
        rgb = np.zeros((height, width, 3), dtype=np.uint8)

        # Gradients for rock / snow
        for i in range(height):
            for j in range(width):
                h_val = norm_h[i, j]
                if h_val > 0.75: # Snow peak
                    rgb[i, j] = [240, 245, 255]
                elif h_val > 0.45: # Alpine rock
                    rgb[i, j] = [120, 115, 110]
                elif h_val > 0.20: # Pine forest / scrub
                    rgb[i, j] = [38, 70, 45]
                else: # Valley floor / riverbed
                    rgb[i, j] = [80, 100, 70]

        # Texture noise
        noise = (np.random.normal(0, 10, (height, width, 3))).astype(np.int16)
        rgb = np.clip(rgb.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        metadata = {
            "name": "Himalayan Ridge & Valley (High Relief)",
            "type": "mountain",
            "description": "Steep mountain terrain with snow-capped ridges, rocky slopes, and deep drainage valleys (1400m - 3100m).",
            "bounds": {"west": 78.500, "east": 78.535, "south": 30.400, "north": 30.435},
            "crs": "EPSG:4326 (WGS84)",
            "ground_truth_min": float(np.min(gt_dem)),
            "ground_truth_max": float(np.max(gt_dem))
        }

        return rgb, gt_dem, metadata

    @staticmethod
    def generate_disaster_scene(width: int = 512, height: int = 512) -> tuple[np.ndarray, np.ndarray, dict]:
        """
        Generates Disaster Management scenario: Landslide scar & flash flood inundation.
        """
        np.random.seed(303)
        x = np.linspace(-2, 2, width)
        y = np.linspace(-2, 2, height)
        xx, yy = np.meshgrid(x, y)

        base_slope = 300.0 + (yy + 2.0) * 150.0 # general hillside slope
        # Landslide scar carving deep depression
        scar_mask = np.exp(-((xx - 0.2 * yy)**2 / 0.15 + (yy - 0.3)**2 / 1.2))
        landslide_depth = scar_mask * 65.0 # 65m gouge
        # Debris pile accumulation at bottom
        debris_mask = np.exp(-((xx)**2 / 0.3 + (yy + 1.2)**2 / 0.2))
        debris_height = debris_mask * 35.0

        gt_dem = base_slope - landslide_depth + debris_height + np.random.normal(0, 1.5, (height, width)).astype(np.float32)

        # Satellite color mapping
        rgb = np.zeros((height, width, 3), dtype=np.uint8)
        rgb[:, :] = [46, 117, 58] # Forest green

        # Brown scar for exposed mud/rock
        mud_mask = scar_mask > 0.15
        rgb[mud_mask] = [160, 110, 70]
        debris_pts = debris_mask > 0.2
        rgb[debris_pts] = [130, 95, 60]

        metadata = {
            "name": "Disaster Zone: Landslide Scar & Debris Impact",
            "type": "disaster",
            "description": "Critical disaster monitoring zone showing slope collapse, debris accumulation, and terrain subsidence (280m - 720m).",
            "bounds": {"west": 76.210, "east": 76.240, "south": 11.450, "north": 11.480},
            "crs": "EPSG:4326 (WGS84)",
            "ground_truth_min": float(np.min(gt_dem)),
            "ground_truth_max": float(np.max(gt_dem))
        }

        return rgb, gt_dem, metadata

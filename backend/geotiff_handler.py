"""
GeoTIFF Handler Module
Handles reading metadata, coordinate bounds, and exporting 32-bit Float Metric DSM GeoTIFFs.
"""

import numpy as np
import io
import struct
import tifffile

class GeoTIFFHandler:
    @staticmethod
    def parse_metadata(image_bytes: bytes) -> dict:
        """
        Parses GeoTIFF metadata from binary stream.
        Returns coordinate bounds, pixel resolution, CRS info if present.
        """
        metadata = {
            "is_georeferenced": False,
            "crs": "Local/Relative",
            "bounds": None,
            "resolution": (1.0, 1.0),
            "width": 0,
            "height": 0
        }
        
        try:
            with io.BytesIO(image_bytes) as f:
                with tifffile.TiffFile(f) as tif:
                    page = tif.pages[0]
                    metadata["width"] = page.shape[1] if len(page.shape) >= 2 else page.shape[0]
                    metadata["height"] = page.shape[0]
                    
                    tags = page.tags
                    # ModelTiepointTag (33922) and ModelPixelScaleTag (33550) or GeoKeyDirectoryTag (34735)
                    if 33550 in tags and 33922 in tags:
                        pixel_scale = tags[33550].value
                        tiepoints = tags[33922].value
                        
                        dx, dy = float(pixel_scale[0]), float(pixel_scale[1])
                        # tiepoints: (I, J, K, X, Y, Z)
                        origin_x, origin_y = float(tiepoints[3]), float(tiepoints[4])
                        
                        min_x = origin_x
                        max_y = origin_y
                        max_x = origin_x + dx * metadata["width"]
                        min_y = origin_y - dy * metadata["height"]
                        
                        metadata["is_georeferenced"] = True
                        metadata["crs"] = "WGS84 / EPSG:4326" if min_x >= -180 and max_x <= 180 else "Projected / UTM"
                        metadata["bounds"] = {
                            "west": min_x,
                            "east": max_x,
                            "south": min_y,
                            "north": max_y
                        }
                        metadata["resolution"] = (dx, dy)
        except Exception as e:
            # Not a valid GeoTIFF or lacks tags, fallback gracefully
            pass
            
        return metadata

    @staticmethod
    def export_dsm_geotiff(
        dsm_array: np.ndarray,
        bounds: dict = None,
        resolution: tuple = (1.0, 1.0)
    ) -> bytes:
        """
        Exports a 2D float32 numpy array as a georeferenced GeoTIFF binary buffer.
        """
        dsm_float = np.ascontiguousarray(dsm_array, dtype=np.float32)
        height, width = dsm_float.shape
        
        # Build GeoTIFF metadata tags if bounds are provided
        extratags = []
        if bounds:
            dx = (bounds["east"] - bounds["west"]) / width
            dy = (bounds["north"] - bounds["south"]) / height
            
            # ModelPixelScaleTag: 33550 (ScaleX, ScaleY, ScaleZ)
            extratags.append((33550, 'd', 3, (dx, dy, 0.0), False))
            
            # ModelTiepointTag: 33922 (I, J, K, X, Y, Z)
            extratags.append((33922, 'd', 6, (0.0, 0.0, 0.0, bounds["west"], bounds["north"], 0.0), False))
            
            # GeoKeyDirectoryTag: 34735
            # Header: KeyDirectoryVersion (1), KeyRevision (1), MinorRevision (0), NumberOfKeys (3)
            # Key 1: GTModelTypeGeoKey (1024) -> ModelTypeProjected (1) or Geographic (2)
            # Key 2: GTRasterTypeGeoKey (1025) -> RasterPixelIsArea (1)
            # Key 3: GeographicTypeGeoKey (2048) -> GCS_WGS_84 (4326)
            is_wgs84 = -180 <= bounds["west"] <= 180 and -90 <= bounds["south"] <= 90
            model_type = 2 if is_wgs84 else 1
            geo_keys = [
                1, 1, 0, 3,
                1024, 0, 1, model_type,
                1025, 0, 1, 1,
                2048, 0, 1, 4326 if is_wgs84 else 32643
            ]
            extratags.append((34735, 'H', len(geo_keys), tuple(geo_keys), False))

        output_io = io.BytesIO()
        tifffile.imwrite(
            output_io,
            dsm_float,
            photometric='minisblack',
            extratags=extratags if extratags else None
        )
        output_io.seek(0)
        return output_io.getvalue()

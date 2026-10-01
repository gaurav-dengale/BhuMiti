"""
BhuMiti 3D Mesh & Point Cloud Generator
Generates textured 3D OBJ, GLTF, PLY, and XYZ Point Cloud files from DSM elevation arrays.
"""

import numpy as np
import io
import trimesh

class MeshGenerator:
    @staticmethod
    def generate_mesh(
        dsm_array: np.ndarray,
        rgb_image: np.ndarray = None,
        stride: int = 2,
        z_scale: float = 1.0
    ) -> trimesh.Trimesh:
        """
        Builds a 3D indexed triangle mesh from 2D elevation grid with UV texture mapping.
        """
        h, w = dsm_array.shape
        
        # Subsample grid for interactive rendering and reasonable file size
        sub_dsm = dsm_array[::stride, ::stride]
        gh, gw = sub_dsm.shape
        
        # 1. Create (X, Y, Z) vertex grid
        # Center in world space: X in [-w/2, w/2], Y in [-h/2, h/2]
        x_coords = np.linspace(-w / 2.0, w / 2.0, gw)
        y_coords = np.linspace(h / 2.0, -h / 2.0, gh)
        xx, yy = np.meshgrid(x_coords, y_coords)
        zz = sub_dsm * z_scale

        vertices = np.column_stack([xx.ravel(), yy.ravel(), zz.ravel()]).astype(np.float32)

        # 2. UV texture coordinates in [0, 1]
        u_coords = np.linspace(0.0, 1.0, gw)
        v_coords = np.linspace(1.0, 0.0, gh)
        uu, vv = np.meshgrid(u_coords, v_coords)
        uvs = np.column_stack([uu.ravel(), vv.ravel()]).astype(np.float32)

        # 3. Generate Triangles (Indexed faces)
        # For each cell (i, j): 2 triangles
        i_idx, j_idx = np.meshgrid(np.arange(gh - 1), np.arange(gw - 1), indexing='ij')
        i_idx = i_idx.ravel()
        j_idx = j_idx.ravel()

        top_left = i_idx * gw + j_idx
        top_right = top_left + 1
        bottom_left = (i_idx + 1) * gw + j_idx
        bottom_right = bottom_left + 1

        tri1 = np.column_stack([top_left, bottom_left, top_right])
        tri2 = np.column_stack([top_right, bottom_left, bottom_right])
        faces = np.vstack([tri1, tri2]).astype(np.int32)

        # 4. Create Trimesh object
        mesh = trimesh.Trimesh(
            vertices=vertices,
            faces=faces,
            process=False
        )

        # Vertex colors or visual texture
        if rgb_image is not None:
            # Downsample RGB texture to match vertex grid for vertex colors
            import cv2
            rgb_sub = cv2.resize(rgb_image, (gw, gh), interpolation=cv2.INTER_AREA)
            colors = rgb_sub.reshape(-1, 3)
            # Add alpha channel
            colors_rgba = np.column_stack([colors, np.full((colors.shape[0], 1), 255, dtype=np.uint8)])
            mesh.visual.vertex_colors = colors_rgba

        return mesh

    @staticmethod
    def export_obj(mesh: trimesh.Trimesh) -> bytes:
        """Exports mesh to OBJ format."""
        return mesh.export(file_type='obj').encode('utf-8')

    @staticmethod
    def export_ply(mesh: trimesh.Trimesh) -> bytes:
        """Exports mesh to PLY format."""
        return mesh.export(file_type='ply')

    @staticmethod
    def export_gltf(mesh: trimesh.Trimesh) -> bytes:
        """Exports mesh to GLB/GLTF binary format."""
        return mesh.export(file_type='glb')

    @staticmethod
    def export_point_cloud_xyz(
        dsm_array: np.ndarray,
        rgb_image: np.ndarray = None,
        stride: int = 2
    ) -> bytes:
        """
        Exports XYZRGB ASCII point cloud format.
        Format per line: X Y Z R G B
        """
        h, w = dsm_array.shape
        sub_dsm = dsm_array[::stride, ::stride]
        gh, gw = sub_dsm.shape

        x_coords = np.linspace(-w / 2.0, w / 2.0, gw)
        y_coords = np.linspace(h / 2.0, -h / 2.0, gh)
        xx, yy = np.meshgrid(x_coords, y_coords)
        zz = sub_dsm

        if rgb_image is not None:
            import cv2
            rgb_sub = cv2.resize(rgb_image, (gw, gh), interpolation=cv2.INTER_AREA)
            r = rgb_sub[:, :, 0].ravel()
            g = rgb_sub[:, :, 1].ravel()
            b = rgb_sub[:, :, 2].ravel()
        else:
            r = np.full(gh * gw, 200, dtype=np.uint8)
            g = np.full(gh * gw, 200, dtype=np.uint8)
            b = np.full(gh * gw, 200, dtype=np.uint8)

        xyzrgb = np.column_stack([xx.ravel(), yy.ravel(), zz.ravel(), r, g, b])
        
        output = io.StringIO()
        np.savetxt(output, xyzrgb, fmt='%.3f %.3f %.3f %d %d %d', header='X Y Z R G B', comments='# ')
        return output.getvalue().encode('utf-8')

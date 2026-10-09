"""Settings service wrapping existing SettingsManager."""

import os
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException
from src.lib.settings import get_settings
from src.web.schemas.settings import (
    SettingsResponse,
    SettingsUpdateRequest,
    ClearCacheResponse,
)


class SettingsService:
    """Service for querying and modifying application settings."""

    def __init__(self):
        self.mgr = get_settings()

    def _get_dir_size(self, path: Path) -> int:
        """Calculate total directory size in bytes."""
        total_size = 0
        if not path.exists() or not path.is_dir():
            return 0
        try:
            for entry in os.scandir(path):
                if entry.is_file(follow_symlinks=False):
                    total_size += entry.stat().st_size
                elif entry.is_dir(follow_symlinks=False):
                    total_size += self._get_dir_size(Path(entry.path))
        except (PermissionError, OSError):
            pass
        return total_size

    def _validate_writable_dir(self, dir_path_str: str, field_name: str) -> Path:
        """Validate that a directory path exists and is writable."""
        if not dir_path_str or not dir_path_str.strip():
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_path", "message": f"{field_name} cannot be empty"},
            )
        p = Path(dir_path_str).resolve()
        if not p.exists():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "path_not_found",
                    "message": f"Path for {field_name} does not exist: {p}",
                },
            )
        if not p.is_dir():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "not_a_directory",
                    "message": f"Path for {field_name} is not a directory: {p}",
                },
            )
        if not os.access(p, os.W_OK):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "path_not_writable",
                    "message": f"Directory for {field_name} is not writable: {p}",
                },
            )
        return p

    def get_current_settings(self) -> SettingsResponse:
        """Return current application settings and storage metrics."""
        cache_str = self.mgr.cache_location
        data_str = self.mgr.computed_data_location

        cache_path = Path(cache_str).resolve()
        data_path = Path(data_str).resolve()

        cache_bytes = self._get_dir_size(cache_path) if cache_path.exists() else 0
        cache_mb = round(cache_bytes / (1024 * 1024), 2)

        return SettingsResponse(
            cacheLocation=cache_str,
            computedDataLocation=data_str,
            cacheSizeBytes=cache_bytes,
            cacheSizeMb=cache_mb,
            cacheExists=cache_path.exists(),
            dataExists=data_path.exists(),
        )

    def update_settings(self, req: SettingsUpdateRequest) -> SettingsResponse:
        """Validate and update directory paths in SettingsManager."""
        if req.cacheLocation is not None:
            self._validate_writable_dir(req.cacheLocation, "cacheLocation")
            self.mgr.cache_location = req.cacheLocation

        if req.computedDataLocation is not None:
            self._validate_writable_dir(req.computedDataLocation, "computedDataLocation")
            self.mgr.computed_data_location = req.computedDataLocation

        self.mgr.save()
        return self.get_current_settings()

    def clear_cache(self) -> ClearCacheResponse:
        """Clear FastF1 cache files safely without removing the folder itself."""
        cache_path = Path(self.mgr.cache_location).resolve()
        if not cache_path.exists() or not cache_path.is_dir():
            return ClearCacheResponse(
                clearedBytes=0,
                filesRemoved=0,
                message="Cache directory does not exist or is already empty.",
            )

        cleared_bytes = 0
        files_removed = 0

        # Recursively remove files inside the cache directory
        for root, dirs, files in os.walk(cache_path, topdown=False):
            for file in files:
                file_path = Path(root) / file
                try:
                    file_size = file_path.stat().st_size
                    file_path.unlink()
                    cleared_bytes += file_size
                    files_removed += 1
                except (PermissionError, OSError):
                    pass
            for d in dirs:
                dir_to_remove = Path(root) / d
                try:
                    dir_to_remove.rmdir()
                except (PermissionError, OSError):
                    pass

        return ClearCacheResponse(
            clearedBytes=cleared_bytes,
            filesRemoved=files_removed,
            message=f"Successfully cleared {files_removed} cache files ({round(cleared_bytes / (1024 * 1024), 2)} MB).",
        )


settings_service = SettingsService()

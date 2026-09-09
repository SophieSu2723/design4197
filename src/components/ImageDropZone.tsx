import React, { useState, useRef } from 'react';
import './ImageDropZone.css';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

interface ImageDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  /** Optional label (e.g. "Drop images here or click to browse") */
  label?: string;
}

const ImageDropZone: React.FC<ImageDropZoneProps> = ({
  onFilesSelected,
  disabled = false,
  label = 'Drop images here or click to browse',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizeFiles = (files: FileList | null): File[] => {
    if (!files || files.length === 0) return [];
    const accepted = ACCEPT.split(',').map((t) => t.trim());
    return Array.from(files).filter((f) => f.type.startsWith('image/'));
  };

  const handleFiles = (fileList: FileList | null) => {
    const list = normalizeFiles(fileList);
    if (list.length > 0) onFilesSelected(list);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div
      className={`image-drop-zone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) handleClick();
      }}
      aria-label={label}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
        className="image-drop-zone-input"
        aria-hidden
      />
      <span className="image-drop-zone-text">{label}</span>
      <span className="image-drop-zone-sub">Accepts multiple images (JPEG, PNG, GIF, WebP)</span>
    </div>
  );
};

export default ImageDropZone;

import React from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { FileUploadCard } from './FileUploadCard';

interface FileUploadModalProps {
  open: boolean;
  onClose: () => void;
}

export function FileUploadModal({ open, onClose }: FileUploadModalProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Tải tài liệu lên" description="Tải tệp PDF, DOCX, Ảnh, Markdown hoặc TXT vào không gian làm việc cá nhân.">
      <div className="space-y-4">
        <FileUploadCard />
      </div>
    </Dialog>
  );
}

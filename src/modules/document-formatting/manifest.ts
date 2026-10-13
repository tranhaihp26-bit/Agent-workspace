import type { ModuleManifest } from '../../../shared/contracts/module';
import { DocumentFormattingModule } from './DocumentFormattingModule';

export const documentFormattingManifest: ModuleManifest = {
  id: 'document-formatting',
  version: '1.0.0',
  meta: {
    name: 'Định dạng văn bản Word',
    description: 'Kiểm tra, chuẩn hóa và định dạng tài liệu Word theo Nghị định 30/2020/NĐ-CP và các quy chuẩn học thuật, báo cáo.',
    icon: 'FileText',
    order: 3,
  },
  navigation: [
    {
      id: 'document-formatting',
      label: 'Định dạng Word',
      path: '/documents',
      icon: 'FileText',
      order: 3,
    },
  ],
  routes: [
    {
      path: '/documents',
      component: DocumentFormattingModule,
      exact: true,
    },
  ],
  permissions: ['files.read', 'files.write'],
  agent: {
    suggestions: [
      {
        id: 'suggest-doc-check',
        label: 'Kiểm tra văn bản theo Nghị định 30',
        prompt: 'Kiểm tra và chuẩn hóa thể thức văn bản Word theo Nghị định 30/2020/NĐ-CP.',
      },
    ],
  },
};

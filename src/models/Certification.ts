// src/models/Certification.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class Certification extends Model {}

Certification.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  title: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '인증 및 인허가명 (예: 벤처기업확인서, ISO9001 등)' 
  },
  issuer: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '발급 기관 (예: 중소벤처기업부)' 
  },
  issueDate: { 
    type: DataTypes.DATEONLY, 
    allowNull: true, 
    comment: '발급 일자' 
  },
  imageUrl: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '인증서 이미지 또는 스캔 파일 URL' 
  },
  description: { 
    type: DataTypes.TEXT, 
    allowNull: true, 
    comment: '상세 설명 및 비고' 
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true, 
    comment: '사이트 노출 여부 (true: 노출, false: 숨김)' 
  }
}, { 
  sequelize, 
  tableName: 'certifications',
  comment: '관리자 인증·인허가 관리 테이블' 
});
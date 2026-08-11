import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class Policy extends Model {}
Policy.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true, 
    comment: '정책 고유 PK' 
  },
  type: { 
    type: DataTypes.ENUM('TERMS', 'PRIVACY', 'MARKETING'), 
    allowNull: false, 
    comment: '정책 구분 (TERMS: 이용약관, PRIVACY: 개인정보처리방침, MARKETING: 마케팅 수신동의 등)' 
  },
  version: { 
    type: DataTypes.STRING(50), 
    allowNull: false, 
    comment: '정책 버전 (예: v1.0, 2026-07-31 시행자료)' 
  },
  content: { 
    type: DataTypes.TEXT('long'), 
    allowNull: false, 
    comment: '약관 및 정책 상세 내용 (HTML 또는 평문 저장)' 
  },
  isRequired: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true, 
    comment: '필수 동의 여부 (true: 필수, false: 선택)' 
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false, 
    comment: '현재 적용 중인 정책 여부 (type별로 하나만 true가 되도록 관리)' 
  }
}, { 
  sequelize, 
  tableName: 'policies',
  comment: '이용약관, 개인정보처리방침 등 정책 내용 및 버전 관리 테이블'
});
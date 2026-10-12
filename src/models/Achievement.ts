// src/models/Achievement.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class Achievement extends Model {}

Achievement.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  year: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '년도 (예: 2025, 2024)' 
  },
  dateOrMonth: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '월/일 또는 기간 (예: 12.23, 10.27~11)' 
  },
  title: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '실적 내용' 
  },
  description: { 
    type: DataTypes.TEXT, 
    allowNull: true, 
    comment: '추가 설명 (필요시)' 
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true, 
    comment: '사이트 노출 여부' 
  }
}, { 
  sequelize, 
  tableName: 'achievements',
  comment: '주요실적(연혁) 관리 테이블' 
});
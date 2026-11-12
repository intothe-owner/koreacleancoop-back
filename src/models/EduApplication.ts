// src/models/EduApplication.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class EduApplication extends Model {}

EduApplication.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true, 
    comment: '교육신청 고유 PK' 
  },
  scheduleId: { 
    type: DataTypes.INTEGER, 
    allowNull: true, 
    comment: '신청한 교육 일정 PK (매핑용)' 
  },
  eduName: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '신청 교육명 (일정 삭제 시에도 보존하기 위한 텍스트 저장)' 
  },
  applicantName: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '고객명' 
  },
  contact: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '연락처' 
  },
  inquiry: { 
    type: DataTypes.TEXT, 
    allowNull: true, 
    comment: '문의사항' 
  }
}, { 
  sequelize, 
  tableName: 'edu_applications',
  paranoid: true,
  comment: '고객 교육 신청 내역 테이블' 
});
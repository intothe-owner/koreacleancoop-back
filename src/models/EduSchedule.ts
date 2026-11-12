// src/models/EduSchedule.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class EduSchedule extends Model {}

EduSchedule.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true, 
    comment: '교육일정 고유 PK' 
  },
  title: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '교육명' 
  },
  startDate: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '교육 시작일 (예: 2026-12-01)' 
  },
  endDate: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '교육 일시 (예: 2026-12-01 14:00 ~ 16:00)' 
  },
  location: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '교육 장소' 
  },
  status: { 
    type: DataTypes.ENUM('준비중', '모집중', '종료'), 
    defaultValue: '준비중', 
    comment: '비고/상태 (프론트: 준비중, 모집중만 노출 / 관리자: 전체 노출)' 
  }
}, { 
  sequelize, 
  tableName: 'edu_schedules',
  paranoid: true, // 논리 삭제 지원
  comment: '교육 일정 관리 테이블' 
});
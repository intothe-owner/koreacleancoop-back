// src/models/WorkReport.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class WorkReport extends Model {
  public id!: number;
  public quoteRequestId!: number;
  public memberId!: number;
  public workDate!: string;
  public entranceImg!: string;
  public beforeImg!: string;
  public duringImg!: string;
  public afterImg!: string;
}

WorkReport.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  quoteRequestId: { type: DataTypes.INTEGER, allowNull: false, comment: '대상 견적요청 ID' },
  memberId: { type: DataTypes.INTEGER, allowNull: false, comment: '보고서를 작성한 조합원회원 ID' },
  workDate: { type: DataTypes.DATEONLY, allowNull: false, comment: '실제 시공/작업일' },
  entranceImg: { type: DataTypes.STRING, allowNull: false, comment: '입구 사진 경로' },
  beforeImg: { type: DataTypes.STRING, allowNull: false, comment: '작업 전 사진 경로' },
  duringImg: { type: DataTypes.STRING, allowNull: false, comment: '작업 중 사진 경로' },
  afterImg: { type: DataTypes.STRING, allowNull: false, comment: '작업 후 사진 경로' },
}, { 
  sequelize, 
  tableName: 'work_reports',
  timestamps: true
});
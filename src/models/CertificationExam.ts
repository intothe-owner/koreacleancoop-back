import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface CertificationExamAttributes {
  id: number;
  year: number;
  sessionNumber: number;
  status: 'READY' | 'QR_OPEN' | 'STARTED' | 'CLOSED';
  qrToken?: string | null;
  questionCount: number;
  passingScore: number;
}

interface CertificationExamCreationAttributes extends Optional<CertificationExamAttributes, 'id' | 'status' | 'qrToken' | 'questionCount' | 'passingScore'> {}

export class CertificationExam extends Model<CertificationExamAttributes, CertificationExamCreationAttributes> implements CertificationExamAttributes {
  public id!: number;
  public year!: number;
  public sessionNumber!: number;
  public status!: 'READY' | 'QR_OPEN' | 'STARTED' | 'CLOSED';
  public qrToken!: string | null;
  public questionCount!: number;
  public passingScore!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt!: Date;
}

CertificationExam.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, comment: '시험 고유 PK' },
  year: { type: DataTypes.INTEGER, allowNull: false, comment: '시험 년도' },
  sessionNumber: { type: DataTypes.INTEGER, allowNull: false, comment: '시험 회차' },
  status: { 
    type: DataTypes.ENUM('READY', 'QR_OPEN', 'STARTED', 'CLOSED'), 
    defaultValue: 'READY', 
    comment: '상태: READY(대기), QR_OPEN(QR생성), STARTED(시작), CLOSED(종료)' 
  },
  qrToken: { type: DataTypes.STRING, allowNull: true, comment: 'QR 코드 고유 토큰' },
  questionCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30, comment: '출제 문항 수' },
  passingScore: { type: DataTypes.INTEGER, defaultValue: 60, comment: '합격 기준 점수' }
}, { 
  sequelize, 
  tableName: 'certification_exams',
  paranoid: true,
  comment: '자격증 시험 기본 정보 및 관리' 
});
import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface ExamSessionAttributes {
  id: number;
  examId: number;
  memberId?: number | null;
  centerName: string;
  studentName: string;
  randomQuestions?: any | null; // JSON 배열
  score: number;
  isPassed: boolean;
  isSubmitted: boolean;
}

interface ExamSessionCreationAttributes extends Optional<ExamSessionAttributes, 'id' | 'memberId' | 'randomQuestions' | 'score' | 'isPassed' | 'isSubmitted'> {}

export class ExamSession extends Model<ExamSessionAttributes, ExamSessionCreationAttributes> implements ExamSessionAttributes {
  public id!: number;
  public examId!: number;
  public memberId!: number | null;
  public centerName!: string;
  public studentName!: string;
  public randomQuestions!: any | null;
  public score!: number;
  public isPassed!: boolean;
  public isSubmitted!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt!: Date;
}

ExamSession.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  examId: { type: DataTypes.INTEGER, allowNull: false },
  memberId: { type: DataTypes.INTEGER, allowNull: true },
  centerName: { type: DataTypes.STRING, allowNull: false },
  studentName: { type: DataTypes.STRING, allowNull: false },
  randomQuestions: { type: DataTypes.JSON, allowNull: true },
  score: { type: DataTypes.INTEGER, defaultValue: 0 },
  isPassed: { type: DataTypes.BOOLEAN, defaultValue: false },
  isSubmitted: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { 
  sequelize, 
  tableName: 'exam_sessions',
  paranoid: true,
});
import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface QuestionAttributes {
  id: number;
  examId: number;
  content: string;
  options: any; // JSON 배열 형태 (보기)
  correctAnswer: string;
}

interface QuestionCreationAttributes extends Optional<QuestionAttributes, 'id'> {}

export class Question extends Model<QuestionAttributes, QuestionCreationAttributes> implements QuestionAttributes {
  public id!: number;
  public examId!: number;
  public content!: string;
  public options!: any;
  public correctAnswer!: string; // 💡 이 부분이 추가되어야 합니다.

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt!: Date;
}

Question.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, comment: '문제 고유 PK' },
  examId: { type: DataTypes.INTEGER, allowNull: false, comment: '연결된 시험 ID' },
  content: { type: DataTypes.TEXT, allowNull: false, comment: '문제 내용' },
  options: { type: DataTypes.JSON, allowNull: false, comment: '문제 보기 배열' },
  correctAnswer: { type: DataTypes.STRING, allowNull: false, comment: '정답' },
}, { 
  sequelize, 
  tableName: 'questions',
  paranoid: true,
  comment: '회차별 시험 문제 풀' 
});
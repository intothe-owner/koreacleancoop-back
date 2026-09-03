import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface UserAnswerAttributes {
  id: number;
  sessionId: number;
  questionId: number;        // 💡 이 필드들이 명시되어야 합니다.
  submittedAnswer: string;
  isCorrect: boolean;
}

interface UserAnswerCreationAttributes extends Optional<UserAnswerAttributes, 'id' | 'isCorrect'> {}

export class UserAnswer extends Model<UserAnswerAttributes, UserAnswerCreationAttributes> implements UserAnswerAttributes {
  public id!: number;
  public sessionId!: number;
  public questionId!: number;        // 💡 클래스 내부 속성 선언
  public submittedAnswer!: string;   // 💡 클래스 내부 속성 선언
  public isCorrect!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt!: Date;
}

UserAnswer.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, comment: '답안 고유 PK' },
  sessionId: { type: DataTypes.INTEGER, allowNull: false, comment: '연결된 ExamSession ID' },
  questionId: { type: DataTypes.INTEGER, allowNull: false, comment: '풀이한 문제 ID' },
  submittedAnswer: { type: DataTypes.STRING, allowNull: true, comment: '수강생이 선택한 답' },
  isCorrect: { type: DataTypes.BOOLEAN, defaultValue: false, comment: '정답 여부' }
}, { 
  sequelize, 
  tableName: 'user_answers',
  paranoid: true,
  comment: '수강생이 제출한 개별 문제의 답안 내역' 
});
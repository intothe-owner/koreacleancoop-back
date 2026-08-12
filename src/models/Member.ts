import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class Member extends Model {}
Member.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  
  // ✨ 신규: 회원 유형 및 기업명 추가
  memberType: { 
    type: DataTypes.ENUM('NORMAL', 'UNION'), 
    defaultValue: 'NORMAL', 
    comment: '회원 유형 (NORMAL: 일반회원, UNION: 조합원회원)' 
  },
  companyName: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '조합원회원 기업명' 
  },

  loginId: { type: DataTypes.STRING, unique: false, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  nickname: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  mobile: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  dob: { type: DataTypes.DATEONLY },
  level: { type: DataTypes.INTEGER, defaultValue: 1, comment: '회원 권한 레벨' },
  snsProvider: { 
    type: DataTypes.ENUM('LOCAL', 'KAKAO', 'NAVER', 'GOOGLE'), 
    defaultValue: 'LOCAL' 
  },
  snsId: { type: DataTypes.STRING },
  approvalFileUrl: { type: DataTypes.STRING, comment: '가입 승인용 증빙 서류 파일 경로/URL' },
}, { sequelize, tableName: 'members' });
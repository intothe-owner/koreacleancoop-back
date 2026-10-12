import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class Customer extends Model {}

Customer.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '고객명 또는 기관명' 
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true, 
    comment: '사이트 노출 여부' 
  }
}, { 
  sequelize, 
  tableName: 'customers',
  comment: '고객현황 관리 테이블' 
});
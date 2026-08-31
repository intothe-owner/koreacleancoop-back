// src/models/CoopMember.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class CoopMember extends Model {}

CoopMember.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  companyName: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '조합원 기업명' 
  },
  contact: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '대표 연락처 (선택)' 
  },
  // ✨ 신규: 기업 로고 및 홈페이지 링크 추가
  logoUrl: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '기업 로고 이미지 파일 경로/URL' 
  },
  homepageUrl: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '기업 공식 홈페이지 URL' 
  },
  address: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '기본 주소 (도로명 또는 지번)' 
  },
  addressDetail: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '상세 주소 (예: 1동 203호)' 
  },
  latitude: { 
    type: DataTypes.DECIMAL(10, 7), 
    allowNull: true, 
    comment: '위도 (Y 좌표)' 
  },
  longitude: { 
    type: DataTypes.DECIMAL(11, 7), 
    allowNull: true, 
    comment: '경도 (X 좌표)' 
  },
  regionSido: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '시/도 (예: 서울특별시, 부산광역시)' 
  },
  regionSigungu: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '시/군/구 (예: 송파구, 해운대구)' 
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true, 
    comment: '사이트 노출 여부' 
  }
}, { 
  sequelize, 
  tableName: 'coop_members',
  comment: '조합원(기업) 현황 관리 테이블' 
});
/**
 * 게임 설정 및 데이터 정의 (config.js)
 */
const GAME_CONFIG = {
    TITLE: 'APProto',
    VERSION: '1.0.0',

    // 초기 설정
    INITIAL: {
        MONEY: 2000,
        INITIAL_WORKERS: 0,
        INITIAL_REGION: 'daegu',
        REPUTATION: 50, // 평판 기본 50
    },

    // 시간 시스템 (하루 120초 = 낮 90초 / 밤 30초)
    TIME: {
        DAY_DURATION: 120, // 초
        DAY_TIME: 90,      // 낮 90초
        NIGHT_TIME: 30,    // 밤 30초
    },

    // 야간 수당 & 야간 경제 할증 (알바비 1.5배, 택배 배송 이익 1.5배)
    NIGHT_SHIFT: {
        WAGE_MULTIPLIER: 1.5,
        PROFIT_MULTIPLIER: 1.5,
    },

    // 지역 정의 (대구: 주황 / 부산: 파랑 / 서울: 초록)
    REGIONS: {
        daegu: {
            id: 'daegu',
            name: '대구',
            color: 0xf39c12,
            colorHex: '#f39c12',
            multiplier: 1.0,
            unlockCost: 0,
            unlocked: true,
        },
        busan: {
            id: 'busan',
            name: '부산',
            color: 0x0088ff,
            colorHex: '#0088ff',
            multiplier: 1.35,
            unlockCost: 1500,
            unlocked: false,
        },
        seoul: {
            id: 'seoul',
            name: '서울',
            color: 0x2ecc71,
            colorHex: '#2ecc71',
            multiplier: 1.7,
            unlockCost: 3500,
            unlocked: false,
        }
    },

    // 입고 시스템
    INBOUND: {
        TRUCK_CAPACITY: 10,
        TRUCK_WAIT_TIME: 20, // 20초 대기 후 잔여분 회차
        DEFAULT_INTERVAL: 25, // 기본 배차 간격 25초
        INTERVAL_LEVELS: [25, 22, 20, 17, 15],
        DOCK_CAPACITY_LEVELS: {
            small: [10, 15, 20],
            medium: [20, 25, 30],
            mega: [30, 40, 50]
        }
    },

    // 출고 시스템
    OUTBOUND: {
        TRUCK_CAPACITY: 10, // 슬롯 10개
        MIN_DEPARTURE_COUNT: 5, // 5개 이상 적재 시 출발 가능
        PALLET_PACKAGE_COUNT: 8, // 파렛트 1개 = 택배 8개 (슬롯 1개 차지)
        BASE_PRICE: 320, // 기본 택배 1개 단가
        FUEL_COST: 150,  // 트럭 1회 출발당 기름값
        FULL_LOAD_BONUS: 600, // 알뜰적재 (10개 꽉 참) 추가 보너스
        FULL_LOAD_REPUTATION: 10, // 알뜰적재 평판 증가
    },

    // 발판 작업 시간 (기본 3초)
    PAD: {
        ACTION_DURATION: 3.0, // 초
    },

    // 플레이어 업그레이드 스펙 (Lv1 ~ Lv5)
    PLAYER_UPGRADES: {
        SPEED: {
            name: '이동 속도',
            levels: [5.2, 6.2, 7.2, 8.2, 9.5],
            costs: [0, 300, 600, 1000, 1600],
            desc: ['기본 속도', '+20% 가속', '+38% 가속', '+58% 가속', '+82% 초고속']
        },
        CAPACITY: {
            name: '최대 소지량',
            levels: [4, 5, 6, 7, 8],
            costs: [0, 400, 800, 1400, 2200],
            desc: ['기본 4개', '최대 5개', '최대 6개', '최대 7개', '최대 8개(마스터)']
        },
        WORK_SPEED: {
            name: '작업 속도',
            levels: [1.0, 1.3, 1.6, 2.0, 2.6],
            costs: [0, 350, 700, 1200, 1900],
            desc: ['기본 1.0x', '1.3배속', '1.6배속', '2.0배속', '2.6배속 빛의속도']
        }
    },

    // 시설 규모 3단계 (유지비: 1단계 -0.5원/초, 2단계 -1.5원/초, 3단계 -3.0원/초)
    WAREHOUSE_TIERS: [
        {
            level: 1,
            name: '작은 창고',
            cost: 0,
            maintenanceCostSec: 0.5, // 분당 30원
            desc: '기본 물류 창고. (유지비: 30원/분)',
            hasCart: false,
            hasConveyor: false,
            hasForklift: false,
        },
        {
            level: 2,
            name: '중형 물류센터',
            cost: 3000,
            maintenanceCostSec: 1.5, // 분당 90원
            desc: '운반 카트 3대 해금 (유지비: 90원/분)',
            hasCart: true,
            hasConveyor: true,
            hasForklift: false,
        },
        {
            level: 3,
            name: '앙팡 메가허브',
            cost: 8000,
            maintenanceCostSec: 3.0, // 분당 180원
            desc: '출고 하역장 8m 대규모 확장 & 스마트 지게차 2대 해금 (8개 파렛트 우선 상차)',
            hasCart: true,
            hasConveyor: true,
            hasForklift: true,
        }
    ],

    // 배차 간격 업그레이드 비용
    TRUCK_INTERVAL_UPGRADES: {
        costs: [0, 500, 1000, 1800, 2800],
    },

    // 입고 선반 적재 용량 업그레이드 (Lv1~5)
    DOCK_CAPACITY_UPGRADES: {
        levels: [10, 20, 30, 35, 40],
        costs: [0, 400, 800, 1500, 2600],
        desc: ['1호기 1층 (10개)', '1호기 2층 증축 (20개)', '2호기 신설 (30개)', '선반 최적화 (35개)', '2호기 2층 증축 (40개 MAX)']
    },

    // 출고 선반 적재 용량 업그레이드 (Lv1~5)
    OUTBOUND_RACK_CAPACITY_UPGRADES: {
        levels: [10, 20, 30, 35, 40],
        costs: [0, 450, 900, 1600, 2800],
        desc: ['기본 1단 (10개)', '2단 증축 (20개)', '3단 증축 (30개)', '적재 최적화 (35개)', '4단 증축 (40개 MAX)']
    },

    // 컨베이어 벨트 업그레이드 (Lv1~5)
    CONVEYOR_SPEED_LEVELS: [1.2, 1.8, 2.5, 3.4, 4.5],
    CONVEYOR_UPGRADE_COSTS: [800, 1200, 1800, 2600, 3800],

    // 알바 직종 설정
    WORKER_ROLES: {
        UNLOADER: {
            id: 'UNLOADER',
            name: '하차 알바',
            desc: '입고 도크에서 스캔 테이블로 택배를 옮깁니다.',
            icon: '📦',
            baseWageSec: 2.0, // 초당 인건비
            hireCost: 250,
            maxCount: 4,
        },
        SCANNER: {
            id: 'SCANNER',
            name: '스캔 알바',
            desc: '스캔 테이블의 스캔 발판에 상주하며 송장 스캔을 전담합니다.',
            icon: '🔍',
            baseWageSec: 2.5,
            hireCost: 350,
            maxCount: 2,
        },
        INSPECTOR: {
            id: 'INSPECTOR',
            name: '검수 알바',
            desc: '분류대 검수 발판에서 검수를 전담합니다. (해금 검수대당 최대 2인 협업 지원)',
            icon: '✅',
            baseWageSec: 2.5,
            hireCost: 350,
            maxCount: 6, // 동적으로 (해금 검수대 수 * 2) 계산 (최대 6명)
        },
        CARRIER: {
            id: 'CARRIER',
            name: '운반 알바',
            desc: '스캔된 택배를 분류대로, 검수 완료된 택배를 출고 도크로 운반합니다.',
            icon: '🚚',
            baseWageSec: 2.2,
            hireCost: 300,
            maxCount: 4, // 최대 4명
        },
        LOADER: {
            id: 'LOADER',
            name: '상차 알바',
            desc: '출고 도크의 택배를 배송 트럭에 차곡차곡 적재합니다.',
            icon: '🚛',
            baseWageSec: 2.4,
            hireCost: 320,
            maxCount: 4, // 최대 4명
        }
    },

    // 단기 베테랑 알바
    VETERAN_WORKER: {
        duration: 180, // 3분(180초)
        hireCost: 750,
        speedMultiplier: 2.0,
        workSpeedMultiplier: 2.0,
    },

    // 알바 숙련도 티어 (신입 > 일반 > 숙련 > 베테랑: 소지량 2 -> 3 -> 4 -> 6개 확장)
    WORKER_PROFICIENCY: [
        { name: '신입', minSec: 0, colorHex: '#ffffff', speedMult: 1.0, workMult: 1.0, maxInventory: 2, badge: '⭐' },
        { name: '일반', minSec: 60, colorHex: '#4dc9ff', speedMult: 1.2, workMult: 1.25, maxInventory: 3, badge: '⭐⭐' },
        { name: '숙련', minSec: 180, colorHex: '#b366ff', speedMult: 1.4, workMult: 1.55, maxInventory: 4, badge: '⭐⭐⭐' },
        { name: '베테랑', minSec: 360, colorHex: '#ffcc00', speedMult: 1.65, workMult: 1.9, maxInventory: 6, badge: '👑' }
    ],

    // 오분류(Missorted) 시스템 설정
    MISSORT: {
        MAX_TRUCK_PASSES: 3, // 출고 차량 3대 지나갈 때까지 보관 후 반송
    },

    // 알바 리롤 비용
    REROLL_COST: 50,

    // 알바 랜덤 이름 목록
    WORKER_NAMES: [
        '김민수', '이지훈', '박서연', '최현우', '정다은',
        '강준혁', '윤서아', '임도윤', '한예린', '오승우',
        '신유진', '배태양', '송하은', '류시원', '권지민'
    ],

    // 이벤트 설정
    FEVER_TIME: {
        DURATION: 300, // 300초(5분)
        COOLDOWN: 180, // 쿨다운 180초
        TRUCK_INTERVAL_RATIO: 0.5, // 배차 간격 50% 단축
        PROFIT_MULTIPLIER: 2.0, // 수익 2배
    },

    // 기상 악화 설정
    WEATHER: {
        EVENT_DURATION: 120, // 120초
        CLEAR_DAYS_THRESHOLD: 5, // 5일 연속 맑음 시 확정 발생
        TYPES: {
            CLEAR: { id: 'clear', name: '맑음', icon: '☀️', color: '#ffb703' },
            SNOW: { id: 'snow', name: '폭설', icon: '❄️', color: '#8ecae6', penalty: '입고 트럭 진입 전면 정지' },
            RAIN: { id: 'rain', name: '폭우', icon: '🌧️', color: '#219ebc', penalty: '물류창고 침수 및 이동속도 45% 저하' },
            THUNDER: { id: 'thunder', name: '뇌우', icon: '⚡', color: '#fb8500', penalty: '실내 정전 발생 및 작업 속도 60% 급감' }
        }
    }
};

window.GAME_CONFIG = GAME_CONFIG;

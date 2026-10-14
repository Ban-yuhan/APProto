/**
 * 3D 모델 및 프로시저럴 시각적 오브젝트 생성기 (models.js)
 */
class ModelFactory {
    constructor() {
        // 공용 머티리얼 캐시
        this.materials = {
            boxCardboard: new THREE.MeshLambertMaterial({ color: 0xd4a373 }),
            boxScannedDaegu: new THREE.MeshLambertMaterial({ color: 0xf39c12 }), // 대구: 주황
            boxScannedBusan: new THREE.MeshLambertMaterial({ color: 0x0088ff }), // 부산: 파랑
            boxScannedSeoul: new THREE.MeshLambertMaterial({ color: 0x2ecc71 }), // 서울: 초록
            boxMissorted: new THREE.MeshLambertMaterial({ color: 0x111827 }),    // 오분류: 검정(Black)
            crossTape: new THREE.MeshLambertMaterial({ color: 0xfacc15 }),       // 검수 십자 테이프: 골드 옐로우
            palletWood: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
            truckBody: new THREE.MeshLambertMaterial({ color: 0x2b5c8f }),
            truckOutboundBody: new THREE.MeshLambertMaterial({ color: 0x1d7a52 }),
            truckCabin: new THREE.MeshLambertMaterial({ color: 0xdddddd }),
            truckWheel: new THREE.MeshLambertMaterial({ color: 0x222222 }),
            truckWindow: new THREE.MeshLambertMaterial({ color: 0x88c0d0 }),
            metalGray: new THREE.MeshLambertMaterial({ color: 0x7f8c8d }),
            tableTop: new THREE.MeshLambertMaterial({ color: 0xecf0f1 }),
            conveyorBelt: new THREE.MeshLambertMaterial({ color: 0x2c3e50 }),
            conveyorRoller: new THREE.MeshLambertMaterial({ color: 0x95a5a6 }),
        };
    }

    // 택배 박스 단품 생성 (십자 포장 테이프 및 오분류 검정 상자 지원)
    createPackageBox(region = null, isInspected = false, isMissorted = false, missortTruckPassCount = 0) {
        const group = new THREE.Group();
        const boxGeo = new THREE.BoxGeometry(0.7, 0.5, 0.7);
        
        // 1. 박스 본체 머티리얼: 오분류 시 무조건 '검정색(Black)'
        let mat = this.materials.boxCardboard;
        if (isMissorted) {
            mat = this.materials.boxMissorted; // 검정색 상자
        } else if (region) {
            if (region === 'daegu') mat = this.materials.boxScannedDaegu;
            else if (region === 'busan') mat = this.materials.boxScannedBusan;
            else if (region === 'seoul') mat = this.materials.boxScannedSeoul;
        }

        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.y = 0.25;
        group.add(mesh);

        // 2. [모듈 5] 검수 완료 상자 '십자(+) 테이프' 포장 비주얼
        // 선물 상자처럼 상단과 4개 측면을 가로/세로로 감싸는 눈에 띄는 십자 포장 테이프
        if (isInspected && !isMissorted) {
            const tapeMat = this.materials.crossTape;
            const tapeW = 0.12;

            // 상단 십자(+) 테이프 (가로 & 세로)
            const topGeoX = new THREE.PlaneGeometry(0.71, tapeW);
            topGeoX.rotateX(-Math.PI / 2);
            const topTapeX = new THREE.Mesh(topGeoX, tapeMat);
            topTapeX.position.set(0, 0.505, 0);
            group.add(topTapeX);

            const topGeoZ = new THREE.PlaneGeometry(tapeW, 0.71);
            topGeoZ.rotateX(-Math.PI / 2);
            const topTapeZ = new THREE.Mesh(topGeoZ, tapeMat);
            topTapeZ.position.set(0, 0.506, 0);
            group.add(topTapeZ);

            // 측면 4방향 수직 밴드
            // 앞면 (Front: +Z)
            const sideGeoF = new THREE.PlaneGeometry(tapeW, 0.505);
            const sideTapeF = new THREE.Mesh(sideGeoF, tapeMat);
            sideTapeF.position.set(0, 0.25, 0.355);
            group.add(sideTapeF);

            // 뒷면 (Back: -Z)
            const sideTapeB = sideTapeF.clone();
            sideTapeB.rotation.y = Math.PI;
            sideTapeB.position.set(0, 0.25, -0.355);
            group.add(sideTapeB);

            // 좌측면 (Left: -X)
            const sideTapeL = sideTapeF.clone();
            sideTapeL.rotation.y = -Math.PI / 2;
            sideTapeL.position.set(-0.355, 0.25, 0);
            group.add(sideTapeL);

            // 우측면 (Right: +X)
            const sideTapeR = sideTapeF.clone();
            sideTapeR.rotation.y = Math.PI / 2;
            sideTapeR.position.set(0.355, 0.25, 0);
            group.add(sideTapeR);

            // 중앙 원형 검수 승인 인장 스티커 (PASSED)
            const sealGeo = new THREE.CircleGeometry(0.12, 16);
            sealGeo.rotateX(-Math.PI / 2);
            const sealMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
            const seal = new THREE.Mesh(sealGeo, sealMat);
            seal.position.set(0, 0.51, 0);
            group.add(seal);
        } else {
            // 미검수 상자 운송장 스티커
            const labelGeo = new THREE.PlaneGeometry(0.35, 0.25);
            labelGeo.rotateX(-Math.PI / 2);
            const labelMat = new THREE.MeshBasicMaterial({ 
                color: isMissorted ? 0xef4444 : (region ? 0xffffff : 0xeeeeee) 
            });
            const labelMesh = new THREE.Mesh(labelGeo, labelMat);
            labelMesh.position.set(0, 0.51, 0);
            group.add(labelMesh);
        }

        // 3. [모듈 7] 오분류 택배 전용 표식 (붉은색 X자 밴드 + 3D 경고 스프라이트: 방치 N회 남음)
        if (isMissorted) {
            const xBandGeo = new THREE.PlaneGeometry(0.48, 0.09);
            xBandGeo.rotateX(-Math.PI / 2);
            const xMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
            const x1 = new THREE.Mesh(xBandGeo, xMat);
            x1.rotation.y = Math.PI / 4;
            x1.position.set(0, 0.52, 0);
            const x2 = new THREE.Mesh(xBandGeo, xMat);
            x2.rotation.y = -Math.PI / 4;
            x2.position.set(0, 0.52, 0);
            group.add(x1);
            group.add(x2);

            // 상단 3D 오분류 텍스트 팻말 (⚠️ 오분류 | 방치 N회 남음)
            const remainingPasses = Math.max(1, 3 - missortTruckPassCount);
            const mCanvas = document.createElement('canvas');
            mCanvas.width = 256;
            mCanvas.height = 70;
            const mctx = mCanvas.getContext('2d');
            mctx.fillStyle = '#7f1d1d';
            mctx.roundRect(2, 2, 252, 66, 8);
            mctx.fill();
            mctx.lineWidth = 3;
            mctx.strokeStyle = '#ef4444';
            mctx.stroke();
            mctx.font = 'bold 22px sans-serif';
            mctx.fillStyle = '#fef08a';
            mctx.textAlign = 'center';
            mctx.textBaseline = 'middle';
            mctx.fillText(`⚠️ 오분류 | 방치 ${remainingPasses}회 남음`, 128, 35);

            const mTex = new THREE.CanvasTexture(mCanvas);
            const mSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: mTex, transparent: true }));
            mSprite.scale.set(1.4, 0.38, 1);
            mSprite.position.set(0, 0.95, 0);
            group.add(mSprite);
        }

        group.userData = {
            region: region,
            isInspected: isInspected,
            isMissorted: isMissorted,
            missortTruckPassCount: missortTruckPassCount,
            isPallet: false
        };

        return group;
    }

    // 파렛트 (택배 8개 2x2x2 묶음)
    createPallet(region = 'daegu', isInspected = true) {
        const group = new THREE.Group();

        // 목재 파렛트 받침대
        const baseGeo = new THREE.BoxGeometry(1.6, 0.15, 1.6);
        const baseMesh = new THREE.Mesh(baseGeo, this.materials.palletWood);
        baseMesh.position.y = 0.075;
        baseMesh.castShadow = true;
        group.add(baseMesh);

        // 2 x 2 x 2 묶음 박스
        let mat = this.materials.boxScannedDaegu;
        if (region === 'busan') mat = this.materials.boxScannedBusan;
        if (region === 'seoul') mat = this.materials.boxScannedSeoul;

        const boxGeo = new THREE.BoxGeometry(0.68, 0.48, 0.68);
        const coords = [-0.38, 0.38];
        const heights = [0.15 + 0.24, 0.15 + 0.48 + 0.24];

        heights.forEach(y => {
            coords.forEach(x => {
                coords.forEach(z => {
                    const box = new THREE.Mesh(boxGeo, mat);
                    box.position.set(x, y, z);
                    box.castShadow = true;
                    group.add(box);
                });
            });
        });

        // 래핑 비닐 밴드 효과
        const wrapGeo = new THREE.BoxGeometry(1.5, 0.95, 1.5);
        const wrapMat = new THREE.MeshLambertMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.28, 
            wireframe: false 
        });
        const wrapMesh = new THREE.Mesh(wrapGeo, wrapMat);
        wrapMesh.position.y = 0.65;
        group.add(wrapMesh);

        group.userData = {
            region: region,
            isInspected: true,
            isPallet: true,
            packageCount: 8
        };

        return group;
    }

    // 배송 트럭 (입고 트럭 or 지역별 출고 트럭)
    createTruck(type = 'inbound', region = 'daegu') {
        const group = new THREE.Group();
        const isOutbound = type === 'outbound';
        
        // 지역별 테마 색상 설정
        let themeColor = 0x2b5c8f; // 기본 입고 트럭: 파랑
        let regionName = '입고';
        let cabinColor = 0xdddddd;

        if (isOutbound) {
            if (region === 'daegu') {
                themeColor = 0xd35400; // 대구: 주황색 테마 (택배 주황색과 일치)
                cabinColor = 0xf39c12;
                regionName = '대구';
            } else if (region === 'busan') {
                themeColor = 0x1d4ed8; // 부산: 파란색 테마 (택배 파란색과 일치)
                cabinColor = 0x3b82f6;
                regionName = '부산';
            } else if (region === 'seoul') {
                themeColor = 0x15803d; // 서울: 초록색 테마 (택배 초록색과 일치)
                cabinColor = 0x22c55e;
                regionName = '서울';
            }
        }

        const bodyMat = isOutbound 
            ? new THREE.MeshLambertMaterial({ color: themeColor }) 
            : this.materials.truckBody;
        const cabinMat = isOutbound
            ? new THREE.MeshLambertMaterial({ color: cabinColor })
            : this.materials.truckCabin;

        // 섀시 프레임
        const chassisGeo = new THREE.BoxGeometry(3.6, 0.4, 7.5);
        const chassisMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.position.y = 0.8;
        chassis.castShadow = true;
        group.add(chassis);

        // 운전석 캐빈
        const cabinGeo = new THREE.BoxGeometry(3.4, 2.4, 2.2);
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, 2.1, 2.4);
        cabin.castShadow = true;
        group.add(cabin);

        // 운전석 앞유리창
        const frontWinGeo = new THREE.PlaneGeometry(2.8, 1.2);
        const frontWin = new THREE.Mesh(frontWinGeo, this.materials.truckWindow);
        frontWin.position.set(0, 2.4, 3.51);
        group.add(frontWin);

        // 적재함 (Cargo Box)
        const cargoGeo = new THREE.BoxGeometry(3.5, 2.8, 4.8);
        const cargo = new THREE.Mesh(cargoGeo, bodyMat);
        cargo.position.set(0, 2.3, -1.2);
        cargo.castShadow = true;
        group.add(cargo);

        // 트럭 로고 텍스트 패널 (캔버스 기반 지역 텍스트)
        const logoCanvas = document.createElement('canvas');
        logoCanvas.width = 256;
        logoCanvas.height = 64;
        const lctx = logoCanvas.getContext('2d');
        const bgHex = typeof cabinColor === 'number' ? '#' + cabinColor.toString(16).padStart(6, '0') : cabinColor;
        lctx.fillStyle = isOutbound ? bgHex : '#ffffff';
        lctx.fillRect(0, 0, 256, 64);
        lctx.fillStyle = isOutbound ? '#ffffff' : '#111827';
        lctx.font = 'bold 28px sans-serif';
        lctx.textAlign = 'center';
        lctx.textBaseline = 'middle';
        lctx.fillText(isOutbound ? `앙팡 • ${regionName}` : '앙팡 입고', 128, 32);

        const logoTex = new THREE.CanvasTexture(logoCanvas);
        const logoMat = new THREE.MeshBasicMaterial({ map: logoTex });

        const logoGeo = new THREE.PlaneGeometry(3.2, 0.8);
        logoGeo.rotateY(Math.PI / 2);
        const leftLogo = new THREE.Mesh(logoGeo, logoMat);
        leftLogo.position.set(-1.76, 2.3, -1.2);
        group.add(leftLogo);

        const rightLogo = leftLogo.clone();
        rightLogo.rotation.y = -Math.PI / 2;
        rightLogo.position.x = 1.76;
        group.add(rightLogo);

        // 바퀴 (앞 2, 뒤 4)
        const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.5, 16);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelPositions = [
            [-1.85, 0.65, 2.4], [1.85, 0.65, 2.4],     // 전륜
            [-1.85, 0.65, -1.8], [1.85, 0.65, -1.8],   // 후륜1
            [-1.85, 0.65, -2.7], [1.85, 0.65, -2.7]    // 후륜2
        ];
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, this.materials.truckWheel);
            wheel.position.set(pos[0], pos[1], pos[2]);
            wheel.castShadow = true;
            group.add(wheel);
        });

        // 헤드라이트 (노란색/흰색)
        const lightGeo = new THREE.BoxGeometry(0.5, 0.3, 0.1);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
        const leftLight = new THREE.Mesh(lightGeo, lightMat);
        leftLight.position.set(-1.2, 1.4, 3.51);
        const rightLight = leftLight.clone();
        rightLight.position.x = 1.2;
        group.add(leftLight);
        group.add(rightLight);

        // 적재함 후면 문 열림/적재 시각화 구역
        const cargoSlotGroup = new THREE.Group();
        cargoSlotGroup.position.set(0, 1.2, -1.2);
        group.add(cargoSlotGroup);
        group.cargoSlotGroup = cargoSlotGroup;

        // 상단 3D 상태 라벨 스프라이트 (적재 현황 및 자동 출발 카운트다운 표시)
        if (isOutbound) {
            const statusCanvas = document.createElement('canvas');
            statusCanvas.width = 256;
            statusCanvas.height = 80;
            const sTex = new THREE.CanvasTexture(statusCanvas);
            const sSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sTex, transparent: true }));
            sSprite.scale.set(3.2, 1.0, 1);
            sSprite.position.set(0, 4.3, 0);
            group.add(sSprite);
            group.statusSprite = sSprite;
            group.statusCanvas = statusCanvas;

            group.updateStatusLabel = function(cargoCount, maxCount, autoTimer = 0) {
                const sctx = statusCanvas.getContext('2d');
                sctx.clearRect(0, 0, 256, 80);

                const isFull = cargoCount >= maxCount;
                sctx.fillStyle = isFull ? 'rgba(234, 88, 12, 0.95)' : 'rgba(17, 24, 39, 0.85)';
                sctx.roundRect(4, 4, 248, 72, 10);
                sctx.fill();
                sctx.lineWidth = 3;
                sctx.strokeStyle = isFull ? '#fef08a' : (region === 'daegu' ? '#f59e0b' : (region === 'busan' ? '#3b82f6' : '#22c55e'));
                sctx.stroke();

                sctx.font = 'bold 24px sans-serif';
                sctx.fillStyle = '#ffffff';
                sctx.textAlign = 'center';
                sctx.textBaseline = 'middle';

                if (autoTimer > 0) {
                    const remain = Math.max(0, (2.0 - autoTimer)).toFixed(1);
                    sctx.fillText(`🚀 [${regionName}] 자동출발: ${remain}초`, 128, 40);
                } else {
                    sctx.fillText(`🚚 [${regionName}] 적재: ${cargoCount}/${maxCount}`, 128, 40);
                }
                sTex.needsUpdate = true;
            };
            group.updateStatusLabel(0, 10, 0);
        }

        // 트럭 상태 관리 데이터
        group.userData = {
            type: type,
            region: region,
            cargoList: [],
            capacity: 10,
            state: 'docked', // arriving, docked, departing, away
            dockTimer: 0,
            autoDepartTimer: 0,
            baseZ: 0,
        };

        return group;
    }

    // 인터랙션 원형 발판 (Trigger Pad)
    createPad(name, radius = 1.2, color = 0x00f0ff, iconText = '') {
        const group = new THREE.Group();
        
        // 베이스 원형 링
        const ringGeo = new THREE.RingGeometry(radius * 0.75, radius, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: color, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: 0.85 
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.y = 0.02;
        group.add(ringMesh);

        // 내부 바닥 채움 (반투명)
        const innerGeo = new THREE.CircleGeometry(radius * 0.75, 32);
        innerGeo.rotateX(-Math.PI / 2);
        const innerMat = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.22
        });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        innerMesh.position.y = 0.015;
        group.add(innerMesh);

        // 3D 게이지 아크 (작업 진행 시 차오름)
        const gaugeGeo = new THREE.RingGeometry(radius * 1.05, radius * 1.22, 32, 1, 0, 0);
        gaugeGeo.rotateX(-Math.PI / 2);
        const gaugeMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95
        });
        const gaugeMesh = new THREE.Mesh(gaugeGeo, gaugeMat);
        gaugeMesh.position.y = 0.03;
        gaugeMesh.visible = false;
        group.add(gaugeMesh);

        group.ringMesh = ringMesh;
        group.innerMesh = innerMesh;
        group.gaugeMesh = gaugeMesh;
        group.radius = radius;
        group.baseColor = color;

        // 발판 진행도 갱신 함수
        group.setProgress = function(progress) { // 0.0 ~ 1.0
            if (progress <= 0) {
                gaugeMesh.visible = false;
            } else {
                gaugeMesh.visible = true;
                gaugeMesh.geometry.dispose();
                const angle = Math.min(1.0, Math.max(0.0, progress)) * Math.PI * 2;
                gaugeMesh.geometry = new THREE.RingGeometry(radius * 1.05, radius * 1.22, 32, 1, -Math.PI / 2, angle);
                gaugeMesh.geometry.rotateX(-Math.PI / 2);
            }
        };

        group.userData = {
            padName: name,
            radius: radius,
            color: color,
            progress: 0,
        };

        return group;
    }

    // 입고 도크 (1호기 선반 + 2호기 확장 렉 선반 물리적 신설)
    createInboundDock() {
        const group = new THREE.Group();

        // 랙 규격
        const rackWidth = 4.0;
        const rackDepth = 2.2;
        const rackHeight = 2.2;
        const frameGeo = new THREE.BoxGeometry(rackWidth, 0.15, rackDepth);
        const frameMat = this.materials.metalGray;
        const legGeo = new THREE.CylinderGeometry(0.08, 0.08, rackHeight);

        // ==========================================
        // [1호기 렉 선반] (X = 0, Z = 0 기준)
        // ==========================================
        const rack1Group = new THREE.Group();
        group.add(rack1Group);

        // 1호기 1단 선반 (기본)
        const shelf1 = new THREE.Mesh(frameGeo, frameMat);
        shelf1.position.y = 0.3;
        shelf1.receiveShadow = true;
        rack1Group.add(shelf1);

        // 1호기 2단 선반 (Lv.2 증축)
        const shelf2 = new THREE.Mesh(frameGeo, frameMat);
        shelf2.position.y = 1.3;
        shelf2.receiveShadow = true;
        shelf2.visible = false; // Lv.2부터 표시
        rack1Group.add(shelf2);

        // 1호기 기둥 4개
        const legPos1 = [
            [-rackWidth / 2 + 0.1, rackHeight / 2, -rackDepth / 2 + 0.1],
            [rackWidth / 2 - 0.1, rackHeight / 2, -rackDepth / 2 + 0.1],
            [-rackWidth / 2 + 0.1, rackHeight / 2, rackDepth / 2 - 0.1],
            [rackWidth / 2 - 0.1, rackHeight / 2, rackDepth / 2 - 0.1]
        ];
        legPos1.forEach(p => {
            const leg = new THREE.Mesh(legGeo, frameMat);
            leg.position.set(p[0], p[1], p[2]);
            rack1Group.add(leg);
        });

        // ==========================================
        // [2호기 렉 선반 신설!] (Z = 2.8 옆에 나란히 배치)
        // Lv.3 이상 시 전체 활성화, Lv.5 시 2단 증축!
        // ==========================================
        const rack2Group = new THREE.Group();
        rack2Group.position.set(0, 0, 2.8);
        rack2Group.visible = false; // Lv.3부터 신설
        group.add(rack2Group);

        // 2호기 1단 선반 (Lv.3 신설)
        const rack2Shelf1 = new THREE.Mesh(frameGeo, frameMat);
        rack2Shelf1.position.y = 0.3;
        rack2Shelf1.receiveShadow = true;
        rack2Group.add(rack2Shelf1);

        // 2호기 2단 선반 (Lv.5 증축)
        const rack2Shelf2 = new THREE.Mesh(frameGeo, frameMat);
        rack2Shelf2.position.y = 1.3;
        rack2Shelf2.receiveShadow = true;
        rack2Shelf2.visible = false; // Lv.5부터 표시
        rack2Group.add(rack2Shelf2);

        // 2호기 기둥 4개
        legPos1.forEach(p => {
            const leg = new THREE.Mesh(legGeo, frameMat);
            leg.position.set(p[0], p[1], p[2]);
            rack2Group.add(leg);
        });

        // 2호기 명판 간판
        const sign2Geo = new THREE.BoxGeometry(2.0, 0.45, 0.08);
        const sign2Mat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
        const sign2 = new THREE.Mesh(sign2Geo, sign2Mat);
        sign2.position.set(0, 2.3, 0);
        rack2Group.add(sign2);

        // 1호기 도크 명판 간판
        const signGeo = new THREE.BoxGeometry(2.4, 0.6, 0.1);
        const signMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(0, 2.5, 0);
        rack1Group.add(sign);

        // 스캔 센서 아치 프레임 결합
        const archPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4);
        const archTopGeo = new THREE.CylinderGeometry(0.06, 0.06, rackWidth + 0.2);
        archTopGeo.rotateZ(Math.PI / 2);

        const poleL = new THREE.Mesh(archPoleGeo, this.materials.metalGray);
        poleL.position.set(-rackWidth / 2 + 0.1, 2.4, 0);
        const poleR = new THREE.Mesh(archPoleGeo, this.materials.metalGray);
        poleR.position.set(rackWidth / 2 - 0.1, 2.4, 0);
        const archTop = new THREE.Mesh(archTopGeo, this.materials.metalGray);
        archTop.position.set(0, 3.6, 0);

        rack1Group.add(poleL);
        rack1Group.add(poleR);
        rack1Group.add(archTop);

        // 상단 레이저 스캐너 모듈 & 붉은 스캔 빔 효과
        const scannerBoxGeo = new THREE.BoxGeometry(1.2, 0.25, 0.5);
        const scannerBoxMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
        const scannerBox = new THREE.Mesh(scannerBoxGeo, scannerBoxMat);
        scannerBox.position.set(0, 3.5, 0);
        rack1Group.add(scannerBox);

        // 레이저 빔 (반투명 콘)
        const beamGeo = new THREE.ConeGeometry(1.8, 2.2, 16, 1, true);
        beamGeo.rotateX(Math.PI);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0xff0044,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(0, 2.4, 0);
        rack1Group.add(beam);
        group.beamMesh = beam;

        // 선반 위 적재 수량 3D 텍스트 표시 스프라이트 (입고 & 스캔 선반: 0 / 10)
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(0, 4.3, 0);
        sprite.scale.set(4.8, 1.2, 1);
        group.add(sprite);

        group.updateText = function(count, capacity) {
            ctx.clearRect(0, 0, 512, 128);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.strokeStyle = count >= capacity ? '#ef4444' : (count > 0 ? '#38bdf8' : '#64748b');
            ctx.lineWidth = 6;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(10, 10, 492, 108, 18);
            } else {
                ctx.rect(10, 10, 492, 108);
            }
            ctx.fill();
            ctx.stroke();

            ctx.font = 'bold 42px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = count >= capacity ? '#f87171' : (count > 0 ? '#facc15' : '#e2e8f0');
            ctx.fillText(`입고&스캔: ${count} / ${capacity}`, 256, 64);
            texture.needsUpdate = true;
        };

        // [모듈 3] 렉 선반 업그레이드 단계별 3D 확장 제어
        group.updateRackTier = function(level) {
            // Lv.1: 1호기 1단만
            // Lv.2: 1호기 2단 증축
            // Lv.3: 2호기 신설 (1단만)
            // Lv.4: 2호기 1단 유지 (수용량 35)
            // Lv.5: 2호기 2단 증축 (풀가동 수용량 40)
            shelf2.visible = (level >= 2);
            rack2Group.visible = (level >= 3);
            rack2Shelf2.visible = (level >= 5);
        };
        group.updateRackTier(1); // 기본 1단계 시작
        group.updateText(0, 10);

        // 박스 렌더링 컨테이너
        const packageContainer = new THREE.Group();
        group.add(packageContainer);
        group.packageContainer = packageContainer;

        group.userData = {
            packages: [],
            capacity: 10,
        };

        return group;
    }

    // [모듈 3] 가로형 철제 렉 선반 (출고 도크 렉 선반)
    createOutboundRack(regionKey = 'daegu') {
        const group = new THREE.Group();

        const regionCfg = (window.GAME_CONFIG && window.GAME_CONFIG.REGIONS && window.GAME_CONFIG.REGIONS[regionKey]) 
            ? window.GAME_CONFIG.REGIONS[regionKey] 
            : { name: '출고', color: 0xf39c12 };
        const regionName = regionCfg.name || '출고';
        const themeColor = regionCfg.color || 0xf39c12;

        // 철제 랙 프레임 (가로형: 폭 4.2, 깊이 2.2)
        const rackWidth = 4.2;
        const rackDepth = 2.2;
        const baseHeight = 2.2;

        const frameGeo = new THREE.BoxGeometry(rackWidth, 0.15, rackDepth);
        const frameMat = this.materials.metalGray;

        // 선반 층 컨테이너
        const shelvesGroup = new THREE.Group();
        group.add(shelvesGroup);

        // 기둥 4개 (지역 테마 색상 포인트)
        const legGeo = new THREE.CylinderGeometry(0.08, 0.08, baseHeight);
        const legMat = new THREE.MeshLambertMaterial({ color: themeColor });
        const legPos = [
            [-rackWidth / 2 + 0.1, baseHeight / 2, -rackDepth / 2 + 0.1],
            [rackWidth / 2 - 0.1, baseHeight / 2, -rackDepth / 2 + 0.1],
            [-rackWidth / 2 + 0.1, baseHeight / 2, rackDepth / 2 - 0.1],
            [rackWidth / 2 - 0.1, baseHeight / 2, rackDepth / 2 - 0.1]
        ];
        const legs = [];
        legPos.forEach(p => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(p[0], p[1], p[2]);
            group.add(leg);
            legs.push(leg);
        });

        // 상단 가로 간판 (적재 현황 및 오분류 경고 실시간 표시)
        const signCanvas = document.createElement('canvas');
        signCanvas.width = 512;
        signCanvas.height = 128;
        const sctx = signCanvas.getContext('2d');
        const signTex = new THREE.CanvasTexture(signCanvas);
        const signSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, transparent: true }));
        signSprite.position.set(0, 3.0, 0);
        signSprite.scale.set(4.4, 1.1, 1);
        group.add(signSprite);

        // 층수 동적 확장 메서드 (층이 모자라면 위로 한 층 늘리기: 10개=1단, 20개=2단, 30개=3단, 35~40개=4단)
        group.updateRackShelves = function(capacity = 20) {
            while (shelvesGroup.children.length > 0) {
                shelvesGroup.remove(shelvesGroup.children[0]);
            }

            let tierCount = 1;
            if (capacity >= 35) tierCount = 4;
            else if (capacity >= 30) tierCount = 3;
            else if (capacity >= 20) tierCount = 2;

            for (let t = 0; t < tierCount; t++) {
                const shelf = new THREE.Mesh(frameGeo, frameMat);
                shelf.position.y = 0.25 + (t * 0.95);
                shelf.receiveShadow = true;
                shelvesGroup.add(shelf);
            }

            const totalHeight = 0.35 + (tierCount * 0.95);
            legs.forEach(leg => {
                leg.scale.y = totalHeight / baseHeight;
                leg.position.y = totalHeight / 2;
            });

            signSprite.position.y = totalHeight + 0.7;
            group.userData.capacity = capacity;
        };
        group.updateRackShelves(20);

        group.updateRackLabel = function(normalCount, missortCount, capacity = null) {
            const maxCap = capacity || group.userData.capacity || 20;
            sctx.clearRect(0, 0, 512, 128);
            sctx.fillStyle = missortCount > 0 ? 'rgba(127, 29, 29, 0.95)' : 'rgba(15, 23, 42, 0.9)';
            sctx.beginPath();
            sctx.roundRect(10, 10, 492, 108, 16);
            sctx.fill();
            sctx.lineWidth = 4;
            sctx.strokeStyle = missortCount > 0 ? '#ef4444' : (regionKey === 'daegu' ? '#f59e0b' : (regionKey === 'busan' ? '#3b82f6' : '#22c55e'));
            sctx.stroke();

            sctx.font = 'bold 36px sans-serif';
            sctx.textAlign = 'center';
            sctx.textBaseline = 'middle';
            sctx.fillStyle = '#ffffff';

            if (missortCount > 0) {
                sctx.fillText(`📦 ${regionName} 도크 | ⚠️오분류 ${missortCount}개`, 256, 64);
            } else {
                sctx.fillText(`📦 ${regionName} 출고 선반: ${normalCount} / ${maxCap}개`, 256, 64);
            }
            signTex.needsUpdate = true;
        };
        group.updateRackLabel(0, 0);
        group.updateRackLabel(0, 0);

        // 적재 박스 3D 렌더링 컨테이너
        const packageContainer = new THREE.Group();
        group.add(packageContainer);
        group.packageContainer = packageContainer;

        group.userData = {
            region: regionKey,
        };

        return group;
    }

    // 송장 스캔 테이블 (좌 -> 우 흐름에 맞게 가로형으로 90도 회전)
    createScanTable() {
        const group = new THREE.Group();

        // 테이블 본체 (가로형: 폭 3.6, 깊이 2.0)
        const tableGeo = new THREE.BoxGeometry(3.6, 0.9, 2.0);
        const table = new THREE.Mesh(tableGeo, this.materials.tableTop);
        table.position.y = 0.45;
        table.castShadow = true;
        table.receiveShadow = true;
        group.add(table);

        // 스캔 아치형 센서 프레임 (가로 폭에 맞춰 배치)
        const archPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.8);
        const archTopGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2);
        archTopGeo.rotateZ(Math.PI / 2);

        const poleL = new THREE.Mesh(archPoleGeo, this.materials.metalGray);
        poleL.position.set(-1.6, 1.8, 0);
        const poleR = new THREE.Mesh(archPoleGeo, this.materials.metalGray);
        poleR.position.set(1.6, 1.8, 0);
        const archTop = new THREE.Mesh(archTopGeo, this.materials.metalGray);
        archTop.position.set(0, 2.7, 0);

        group.add(poleL);
        group.add(poleR);
        group.add(archTop);

        // 레이저 스캐너 모듈 & 붉은 스캔 빔 효과
        const scannerBoxGeo = new THREE.BoxGeometry(1.0, 0.25, 0.4);
        const scannerBoxMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
        const scannerBox = new THREE.Mesh(scannerBoxGeo, scannerBoxMat);
        scannerBox.position.set(0, 2.6, 0);
        group.add(scannerBox);

        // 레이저 빔 (반투명 콘)
        const beamGeo = new THREE.ConeGeometry(1.4, 1.6, 16, 1, true);
        beamGeo.rotateX(Math.PI);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0xff0044,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(0, 1.8, 0);
        group.add(beam);
        group.beamMesh = beam;

        // 테이블 위 박스 배치 컨테이너
        const packageContainer = new THREE.Group();
        packageContainer.position.set(0, 0.9, 0);
        group.add(packageContainer);
        group.packageContainer = packageContainer;

        group.userData = {
            packages: [],
        };

        return group;
    }

    // 분류대 (대구, 부산, 서울 3종)
    // 기획: 90도 회전되어 왼쪽에서 오른쪽으로 이동하는 가로형 직사각형
    // 왼쪽(검수 전) -> 우측(검수 완료)
    createSortingTable(regionKey) {
        const group = new THREE.Group();
        const regConfig = GAME_CONFIG.REGIONS[regionKey];

        const totalWidth = 5.2; // 가로 길이 (좌 -> 우 흐름)
        const totalDepth = 2.6; // 세로 깊이
        const height = 0.85;

        // 테이블 상판 베이스
        const baseGeo = new THREE.BoxGeometry(totalWidth, height, totalDepth);
        const baseMat = new THREE.MeshLambertMaterial({ color: 0x34495e });
        const tableBase = new THREE.Mesh(baseGeo, baseMat);
        tableBase.position.y = height / 2;
        tableBase.castShadow = true;
        tableBase.receiveShadow = true;
        group.add(tableBase);

        // 중앙 분할선 (세로 방향 칸막이: X = 0)
        const dividerGeo = new THREE.BoxGeometry(0.15, 0.15, totalDepth + 0.1);
        const dividerMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
        const divider = new THREE.Mesh(dividerGeo, dividerMat);
        divider.position.set(0, height + 0.08, 0);
        group.add(divider);

        // 왼쪽 영역 (검수 전) 패널: 지역 테마 반투명
        const leftAreaGeo = new THREE.PlaneGeometry((totalWidth / 2) * 0.88, totalDepth * 0.9);
        leftAreaGeo.rotateX(-Math.PI / 2);
        const leftAreaMat = new THREE.MeshBasicMaterial({ color: regConfig.color, transparent: true, opacity: 0.25 });
        const leftAreaMesh = new THREE.Mesh(leftAreaGeo, leftAreaMat);
        leftAreaMesh.position.set(-totalWidth / 4, height + 0.01, 0);
        group.add(leftAreaMesh);

        // 오른쪽 영역 (검수 완료) 패널: 지역 테마 강조
        const rightAreaGeo = new THREE.PlaneGeometry((totalWidth / 2) * 0.88, totalDepth * 0.9);
        rightAreaGeo.rotateX(-Math.PI / 2);
        const rightAreaMat = new THREE.MeshBasicMaterial({ color: regConfig.color, transparent: true, opacity: 0.55 });
        const rightAreaMesh = new THREE.Mesh(rightAreaGeo, rightAreaMat);
        rightAreaMesh.position.set(totalWidth / 4, height + 0.01, 0);
        group.add(rightAreaMesh);

        // 지역 표지판 (상단 북쪽 배치: 카메라를 정면으로 바라보도록 틸트 & 글자와 일체화)
        const signGroup = new THREE.Group();
        signGroup.position.set(0, height + 1.25, -totalDepth / 2 - 0.2);
        // 카메라가 남쪽 위(Y=32, Z=28)에서 내려다보므로 표지판을 카메라 쪽으로 약 25도 틸트
        signGroup.rotation.x = -0.42;
        group.add(signGroup);

        const signGeo = new THREE.BoxGeometry(2.0, 0.65, 0.08);
        const signMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const sign = new THREE.Mesh(signGeo, signMat);
        signGroup.add(sign);

        const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2);
        const pole = new THREE.Mesh(poleGeo, this.materials.metalGray);
        pole.position.set(0, height + 0.6, -totalDepth / 2 - 0.2);
        group.add(pole);

        // 3D 안내 텍스트 팻말: 표지판과 100% 동일한 각도의 Plane 메쉬로 일체화 (뚫고 들어가는 현상 원천 차단)
        const signCanvas = document.createElement('canvas');
        signCanvas.width = 512;
        signCanvas.height = 160;
        const sctx = signCanvas.getContext('2d');
        sctx.fillStyle = '#ffffff';
        sctx.roundRect(8, 8, 496, 144, 20);
        sctx.fill();
        sctx.lineWidth = 8;
        sctx.strokeStyle = '#1e293b';
        sctx.stroke();
        sctx.font = 'bold 76px sans-serif';
        sctx.fillStyle = '#000000'; // 선명한 검정색 텍스트
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText(regConfig.name, 256, 80);

        const signTex = new THREE.CanvasTexture(signCanvas);
        const textPlaneGeo = new THREE.PlaneGeometry(1.96, 0.62);
        const textPlaneMat = new THREE.MeshBasicMaterial({ 
            map: signTex, 
            transparent: true, 
            polygonOffset: true, 
            polygonOffsetFactor: -1 
        });

        // 앞면 텍스트 메쉬 (표지판 앞면에 밀착)
        const frontText = new THREE.Mesh(textPlaneGeo, textPlaneMat);
        frontText.position.set(0, 0, 0.045);
        signGroup.add(frontText);

        // 뒷면 텍스트 메쉬 (뒤에서도 볼 수 있도록 180도 회전 부착)
        const backText = new THREE.Mesh(textPlaneGeo, textPlaneMat);
        backText.rotation.y = Math.PI;
        backText.position.set(0, 0, -0.045);
        signGroup.add(backText);

        // 박스 컨테이너 (왼쪽: 검수 전 / 오른쪽: 검수 완료)
        const uninspectedContainer = new THREE.Group();
        uninspectedContainer.position.set(-totalWidth / 4, height, 0);
        group.add(uninspectedContainer);

        const inspectedContainer = new THREE.Group();
        inspectedContainer.position.set(totalWidth / 4, height, 0);
        group.add(inspectedContainer);

        group.uninspectedContainer = uninspectedContainer;
        group.inspectedContainer = inspectedContainer;

        group.userData = {
            region: regionKey,
            uninspectedPackages: [],
            inspectedPackages: [],
        };

        return group;
    }

    // 캐릭터 생성 (플레이어 or 알바생)
    createCharacter(isPlayer = false, role = null) {
        const group = new THREE.Group();

        // 몸통 (유니폼)
        let bodyColor = isPlayer ? 0x2980b9 : 0x7f8c8d;
        if (!isPlayer && role) {
            if (role === 'UNLOADER') bodyColor = 0xe67e22;
            else if (role === 'SCANNER') bodyColor = 0x9b59b6;
            else if (role === 'INSPECTOR') bodyColor = 0x1abc9c;
            else if (role === 'CARRIER') bodyColor = 0x3498db;
            else if (role === 'LOADER') bodyColor = 0x27ae60;
        }

        const bodyGeo = new THREE.CylinderGeometry(0.4, 0.45, 1.1, 16);
        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.95;
        body.castShadow = true;
        group.add(body);
        group.bodyMesh = body;

        // 머리 (피부)
        const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.75;
        head.castShadow = true;
        group.add(head);

        // 모자 (플레이어는 노란 안전모, 알바는 캡모자)
        const hatColor = isPlayer ? 0xf1c40f : 0x34495e;
        const hatGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 16);
        const hatMat = new THREE.MeshLambertMaterial({ color: hatColor });
        const hat = new THREE.Mesh(hatGeo, hatMat);
        hat.position.y = 1.95;
        group.add(hat);
        group.hatMesh = hat;

        // 두 다리
        const legGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.7, 8);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.set(-0.2, 0.35, 0);
        leftLeg.castShadow = true;
        const rightLeg = leftLeg.clone();
        rightLeg.position.x = 0.2;
        group.add(leftLeg);
        group.add(rightLeg);
        group.leftLeg = leftLeg;
        group.rightLeg = rightLeg;

        // 박스 운반 스택 컨테이너 (캐릭터 머리 위/앞쪽)
        const carryStack = new THREE.Group();
        carryStack.position.set(0, 1.2, 0.45);
        group.add(carryStack);
        group.carryStack = carryStack;

        // 숙련도 링 / 오라 인디케이터 (알바생 바닥)
        const auraGeo = new THREE.RingGeometry(0.5, 0.62, 16);
        auraGeo.rotateX(-Math.PI / 2);
        const auraMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: 0.7 
        });
        const auraMesh = new THREE.Mesh(auraGeo, auraMat);
        auraMesh.position.y = 0.05;
        auraMesh.visible = !isPlayer;
        group.add(auraMesh);
        group.auraMesh = auraMesh;

        // [모듈 2] 단기 알바생 남은 시간 3D 바닥 원형 게이지
        const timerRingGeo = new THREE.RingGeometry(0.66, 0.82, 32, 1, -Math.PI / 2, Math.PI * 2);
        timerRingGeo.rotateX(-Math.PI / 2);
        const timerRingMat = new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88
        });
        const timerRingMesh = new THREE.Mesh(timerRingGeo, timerRingMat);
        timerRingMesh.position.y = 0.055;
        timerRingMesh.visible = false;
        group.add(timerRingMesh);
        group.timerRingMesh = timerRingMesh;

        group.updateTimerProgress = function(remainSec, totalSec = 180) {
            if (remainSec <= 0) {
                timerRingMesh.visible = false;
                return;
            }
            timerRingMesh.visible = true;
            const ratio = Math.max(0.001, Math.min(1.0, remainSec / totalSec));
            const angle = ratio * Math.PI * 2;
            timerRingMesh.geometry.dispose();
            timerRingMesh.geometry = new THREE.RingGeometry(0.66, 0.82, 32, 1, -Math.PI / 2, angle);
            timerRingMesh.geometry.rotateX(-Math.PI / 2);

            // 30초 미만 시 빨간색으로 변경 및 깜빡임 애니메이션
            if (remainSec < 30) {
                const blink = Math.sin(Date.now() * 0.015) > 0;
                timerRingMat.color.setHex(0xef4444);
                timerRingMat.opacity = blink ? 0.95 : 0.25;
            } else {
                timerRingMat.color.setHex(0xf59e0b);
                timerRingMat.opacity = 0.88;
            }
        };

        group.userData = {
            isPlayer: isPlayer,
            role: role,
            inventory: [], // 현재 들고 있는 택배들
            maxInventory: isPlayer ? 4 : 2,
            walkCycle: 0,
            proficiencyTier: 0,
        };

        return group;
    }

    // 운반 카트 (좌측 하단 배치 - 낱개 최대 8개 일괄 운반 가능)
    createCart() {
        const group = new THREE.Group();
        const cartModel = new THREE.Group();
        cartModel.rotation.y = Math.PI; // 손잡이가 플레이어(뒤) 쪽으로 오도록 180도 반전
        group.add(cartModel);

        // 카트 바닥 베이스
        const baseGeo = new THREE.BoxGeometry(1.6, 0.15, 2.4);
        const baseMat = this.materials.metalGray;
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.35;
        base.castShadow = true;
        cartModel.add(base);

        // 프레임 측면 가이드 바 (상자 이탈 방지 가이드)
        const sideBarGeo = new THREE.BoxGeometry(0.06, 0.4, 2.3);
        const sideL = new THREE.Mesh(sideBarGeo, baseMat);
        sideL.position.set(-0.78, 0.55, 0);
        const sideR = new THREE.Mesh(sideBarGeo, baseMat);
        sideR.position.set(0.78, 0.55, 0);
        cartModel.add(sideL);
        cartModel.add(sideR);

        // 손잡이
        const handlePoleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4);
        const handleBarGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4);
        handleBarGeo.rotateZ(Math.PI / 2);

        const hpL = new THREE.Mesh(handlePoleGeo, baseMat);
        hpL.position.set(-0.7, 1.0, 1.15);
        const hpR = new THREE.Mesh(handlePoleGeo, baseMat);
        hpR.position.set(0.7, 1.0, 1.15);
        const bar = new THREE.Mesh(handleBarGeo, baseMat);
        bar.position.set(0, 1.7, 1.15);

        cartModel.add(hpL);
        cartModel.add(hpR);
        cartModel.add(bar);

        // 바퀴 4개
        const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = this.materials.truckWheel;
        const wheelPos = [
            [-0.8, 0.2, -0.9], [0.8, 0.2, -0.9],
            [-0.8, 0.2, 0.9], [0.8, 0.2, 0.9]
        ];
        wheelPos.forEach(p => {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.position.set(p[0], p[1], p[2]);
            cartModel.add(w);
        });

        // 낱개 박스 적재 컨테이너
        const cargoGroup = new THREE.Group();
        cargoGroup.position.set(0, 0.45, 0);
        cartModel.add(cargoGroup);
        group.cargoGroup = cargoGroup;

        // 카트 데이터 관리
        group.userData = {
            isCart: true,
            capacity: 8,
            cargoList: [],
            carrier: null, // 카트를 끌고 있는 캐릭터
            basePos: new THREE.Vector3(),
        };

        // 카트 내 낱개 상자 시각화 갱신
        group.updateVisual = () => {
            while (cargoGroup.children.length > 0) {
                cargoGroup.remove(cargoGroup.children[0]);
            }
            const list = group.userData.cargoList;
            list.forEach((pkg, idx) => {
                const box = this.createPackageBox(pkg.region, pkg.isInspected, pkg.isMissorted || false);
                const layer = Math.floor(idx / 4);
                const localIdx = idx % 4;
                const col = localIdx % 2;
                const row = Math.floor(localIdx / 2);
                box.position.set((col - 0.5) * 0.65, layer * 0.46 + 0.23, (row - 0.5) * 0.75 - 0.1);
                box.scale.set(0.85, 0.85, 0.85);
                cargoGroup.add(box);
            });
        };

        return group;
    }

    // 지게차 (메가허브 해금 - 파렛트 일체형 탈것 탑승 & 8개 적재 시스템)
    createForklift() {
        const group = new THREE.Group();
        const forkModel = new THREE.Group();
        forkModel.rotation.y = Math.PI; // 지게발이 전면을 향하도록 180도 축 반전
        group.add(forkModel);

        // 지게차 차체
        const bodyGeo = new THREE.BoxGeometry(1.8, 1.2, 2.8);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf39c12 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.9, 0.2);
        body.castShadow = true;
        forkModel.add(body);

        // 운전석 케이지
        const cageGeo = new THREE.BoxGeometry(1.6, 1.5, 1.6);
        const cageMat = new THREE.MeshLambertMaterial({ color: 0x222222, wireframe: true });
        const cage = new THREE.Mesh(cageGeo, cageMat);
        cage.position.set(0, 2.2, 0.4);
        forkModel.add(cage);

        // 마스트 기둥 (앞쪽)
        const mastGeo = new THREE.BoxGeometry(0.15, 2.6, 0.15);
        const mastL = new THREE.Mesh(mastGeo, this.materials.metalGray);
        mastL.position.set(-0.7, 1.5, -1.3);
        const mastR = new THREE.Mesh(mastGeo, this.materials.metalGray);
        mastR.position.set(0.7, 1.5, -1.3);
        forkModel.add(mastL);
        forkModel.add(mastR);

        // 포크 지게발 2개
        const forkGeo = new THREE.BoxGeometry(0.12, 0.08, 1.6);
        const forkMat = this.materials.metalGray;
        const forkL = new THREE.Mesh(forkGeo, forkMat);
        forkL.position.set(-0.45, 0.25, -2.0);
        const forkR = new THREE.Mesh(forkGeo, forkMat);
        forkR.position.set(0.45, 0.25, -2.0);
        forkModel.add(forkL);
        forkModel.add(forkR);

        // ⭐ 지게발 위 목재 파렛트 기본 일체형 장착!
        const palletBaseGeo = new THREE.BoxGeometry(1.6, 0.12, 1.6);
        const palletBase = new THREE.Mesh(palletBaseGeo, this.materials.palletWood);
        palletBase.position.set(0, 0.35, -2.0);
        palletBase.castShadow = true;
        forkModel.add(palletBase);

        // 바퀴 4개
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 16);
        wheelGeo.rotateZ(Math.PI / 2);
        const wMat = this.materials.truckWheel;
        const wPos = [
            [-1.0, 0.4, 1.1], [1.0, 0.4, 1.1],
            [-1.0, 0.4, -0.8], [1.0, 0.4, -0.8]
        ];
        wPos.forEach(p => {
            const w = new THREE.Mesh(wheelGeo, wMat);
            w.position.set(p[0], p[1], p[2]);
            forkModel.add(w);
        });

        // 2x2x2 파렛트 상자 적재 컨테이너 (목재 파렛트 위)
        const forkCargo = new THREE.Group();
        forkCargo.position.set(0, 0.41, -2.0);
        forkModel.add(forkCargo);
        group.forkCargo = forkCargo;

        // 지게차 상단 3D 상태 라벨 스프라이트 (회전되지 않는 최상위 group에 배치)
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 300;
        sCanvas.height = 76;
        const sctx = sCanvas.getContext('2d');
        const sTex = new THREE.CanvasTexture(sCanvas);
        const sMat = new THREE.SpriteMaterial({ map: sTex, transparent: true });
        const sSprite = new THREE.Sprite(sMat);
        sSprite.scale.set(3.2, 0.8, 1);
        sSprite.position.set(0, 3.5, 0);
        group.add(sSprite);

        group.updateStatusLabel = function(cargoCount, maxCount, targetRegion, isRiding) {
            sctx.clearRect(0, 0, 300, 76);
            const isFull = cargoCount >= maxCount;
            sctx.fillStyle = isFull ? 'rgba(234, 88, 12, 0.95)' : (isRiding ? 'rgba(3, 105, 161, 0.92)' : 'rgba(15, 23, 42, 0.85)');
            sctx.roundRect(4, 4, 292, 68, 12);
            sctx.fill();
            sctx.lineWidth = 3;
            sctx.strokeStyle = isFull ? '#fef08a' : (isRiding ? '#38bdf8' : '#e2e8f0');
            sctx.stroke();

            sctx.font = 'bold 24px sans-serif';
            sctx.fillStyle = '#ffffff';
            sctx.textAlign = 'center';
            sctx.textBaseline = 'middle';

            const regName = targetRegion && window.GAME_CONFIG && window.GAME_CONFIG.REGIONS[targetRegion]
                ? window.GAME_CONFIG.REGIONS[targetRegion].name
                : '';

            if (isFull) {
                sctx.fillText(`⭐ [${regName} 8/8 완충] 도크로!`, 150, 38);
            } else if (cargoCount > 0) {
                sctx.fillText(`🚜 [${regName} ${cargoCount}/${maxCount}]`, 150, 38);
            } else if (isRiding) {
                sctx.fillText(`🚜 운전 중 (하차: E)`, 150, 38);
            } else {
                sctx.fillText(`🚜 지게차 (탑승: E)`, 150, 38);
            }
            sTex.needsUpdate = true;
        };

        // 지게차 데이터
        group.userData = {
            isForklift: true,
            driver: null,
            capacity: 8,
            cargoList: [],
            targetRegion: null,
            speed: 8.5,
        };

        // 지게발 위 2x2x2 상자 시각화 갱신
        group.updateVisual = () => {
            while (forkCargo.children.length > 0) {
                forkCargo.remove(forkCargo.children[0]);
            }
            const list = group.userData.cargoList;
            const region = group.userData.targetRegion;

            list.forEach((pkg, idx) => {
                const layer = Math.floor(idx / 4); // 0 또는 1층
                const localIdx = idx % 4;
                const col = localIdx % 2;
                const row = Math.floor(localIdx / 2);
                const box = this.createPackageBox(pkg.region || region, true, false);
                box.position.set((col - 0.5) * 0.72, layer * 0.48 + 0.24, (row - 0.5) * 0.72);
                box.scale.set(0.9, 0.9, 0.9);
                forkCargo.add(box);
            });

            // 8개 완충 시 래핑 비닐 씌우기
            if (list.length >= 8) {
                const wrapGeo = new THREE.BoxGeometry(1.5, 0.95, 1.5);
                const wrapMat = new THREE.MeshLambertMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.32
                });
                const wrap = new THREE.Mesh(wrapGeo, wrapMat);
                wrap.position.set(0, 0.5, 0);
                forkCargo.add(wrap);
            }

            group.updateStatusLabel(list.length, 8, region, !!group.userData.driver);
        };

        group.updateStatusLabel(0, 8, null, false);

        return group;
    }

    // 컨베이어 벨트 단품
    createConveyor(length = 6.0) {
        const group = new THREE.Group();

        // 벨트 바디
        const beltGeo = new THREE.BoxGeometry(1.4, 0.4, length);
        const belt = new THREE.Mesh(beltGeo, this.materials.conveyorBelt);
        belt.position.y = 0.5;
        belt.receiveShadow = true;
        group.add(belt);

        // 지지대 다리
        const legGeo = new THREE.BoxGeometry(1.5, 0.5, 0.2);
        const legF = new THREE.Mesh(legGeo, this.materials.metalGray);
        legF.position.set(0, 0.25, length / 2 - 0.2);
        const legB = new THREE.Mesh(legGeo, this.materials.metalGray);
        legB.position.set(0, 0.25, -length / 2 + 0.2);
        group.add(legF);
        group.add(legB);

        // 롤러 시각 효과
        const rollerCount = Math.floor(length / 0.8);
        for (let i = 0; i < rollerCount; i++) {
            const z = -length / 2 + 0.4 + i * 0.8;
            const rollerGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.3);
            rollerGeo.rotateZ(Math.PI / 2);
            const roller = new THREE.Mesh(rollerGeo, this.materials.conveyorRoller);
            roller.position.set(0, 0.72, z);
            group.add(roller);
        }

        group.userData = {
            length: length,
            speed: 1.5,
            items: [], // 벨트 위 이송 중인 택배
        };

        return group;
    }

    // 긴급 미션 오브젝트 (제설 삽 스테이션, 차수판 방수벽 랙, 산업용 비상 발전기)
    createEmergencyFacility(type) {
        const group = new THREE.Group();

        if (type === 'snow') {
            // ==========================================
            // 1. 실외 제설 스테이션 (도구함, 대형 제설삽 2개, 눈더미, 표지판)
            // ==========================================
            // 바닥 목재 데크 베이스
            const baseGeo = new THREE.BoxGeometry(2.4, 0.12, 1.6);
            const baseMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.position.y = 0.06;
            base.receiveShadow = true;
            group.add(base);

            // 제설 자재/염화칼슘 보관함 (노란색 보관함)
            const boxGeo = new THREE.BoxGeometry(1.0, 0.7, 0.7);
            const boxMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
            const saltBox = new THREE.Mesh(boxGeo, boxMat);
            saltBox.position.set(-0.5, 0.45, 0.2);
            saltBox.castShadow = true;
            group.add(saltBox);

            // 보관함 뚜껑
            const lidGeo = new THREE.BoxGeometry(1.08, 0.1, 0.76);
            const lidMat = new THREE.MeshLambertMaterial({ color: 0xd4ac0d });
            const lid = new THREE.Mesh(lidGeo, lidMat);
            lid.position.set(-0.5, 0.85, 0.2);
            group.add(lid);

            // 제설 도구 거치 랙 (목재 기둥)
            const rackPostGeo = new THREE.BoxGeometry(0.08, 1.5, 0.08);
            const rackBarGeo = new THREE.BoxGeometry(1.0, 0.06, 0.06);
            const postL = new THREE.Mesh(rackPostGeo, baseMat);
            postL.position.set(0.15, 0.75, -0.4);
            const postR = new THREE.Mesh(rackPostGeo, baseMat);
            postR.position.set(0.95, 0.75, -0.4);
            const rackBar = new THREE.Mesh(rackBarGeo, baseMat);
            rackBar.position.set(0.55, 1.2, -0.4);
            group.add(postL);
            group.add(postR);
            group.add(rackBar);

            // 대형 제설삽 #1 (빨간색 와이드 스노우 푸셔)
            const shovelGroup1 = new THREE.Group();
            // 자루
            const shaft1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0xf39c12 }));
            shaft1.position.y = 0.7;
            shovelGroup1.add(shaft1);
            // D자 손잡이
            const handle1 = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
            handle1.position.y = 1.4;
            handle1.rotation.z = Math.PI;
            shovelGroup1.add(handle1);
            // 와이드 블레이드
            const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.35, 0.04), new THREE.MeshLambertMaterial({ color: 0xe74c3c }));
            blade1.position.y = 0.2;
            shovelGroup1.add(blade1);

            shovelGroup1.position.set(0.35, 0, -0.3);
            shovelGroup1.rotation.set(-0.15, 0, -0.1);
            shovelGroup1.castShadow = true;
            group.add(shovelGroup1);

            // 대형 제설삽 #2 (파란색 제설삽)
            const shovelGroup2 = new THREE.Group();
            const shaft2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0xbdc3c7 }));
            shaft2.position.y = 0.7;
            shovelGroup2.add(shaft2);
            const handle2 = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
            handle2.position.y = 1.4;
            handle2.rotation.z = Math.PI;
            shovelGroup2.add(handle2);
            const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.04), new THREE.MeshLambertMaterial({ color: 0x2980b9 }));
            blade2.position.y = 0.2;
            shovelGroup2.add(blade2);

            shovelGroup2.position.set(0.75, 0, -0.3);
            shovelGroup2.rotation.set(-0.18, 0, 0.12);
            shovelGroup2.castShadow = true;
            group.add(shovelGroup2);

            // 눈더미 장식
            const snowGeo1 = new THREE.DodecahedronGeometry(0.45, 1);
            const snowGeo2 = new THREE.DodecahedronGeometry(0.3, 1);
            const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            const snow1 = new THREE.Mesh(snowGeo1, snowMat);
            snow1.position.set(-0.5, 0.25, -0.4);
            const snow2 = new THREE.Mesh(snowGeo2, snowMat);
            snow2.position.set(0.7, 0.15, 0.4);
            group.add(snow1);
            group.add(snow2);

            // 3D 안내 텍스트 팻말 (❄️ 제설 도구함)
            const signCanvas = document.createElement('canvas');
            signCanvas.width = 256;
            signCanvas.height = 80;
            const sctx = signCanvas.getContext('2d');
            sctx.fillStyle = '#1e293b';
            sctx.roundRect(4, 4, 248, 72, 10);
            sctx.fill();
            sctx.lineWidth = 4;
            sctx.strokeStyle = '#00d2d3';
            sctx.stroke();
            sctx.font = 'bold 28px sans-serif';
            sctx.fillStyle = '#00d2d3';
            sctx.textAlign = 'center';
            sctx.textBaseline = 'middle';
            sctx.fillText('❄️ 제설 도구함', 128, 40);

            const signTex = new THREE.CanvasTexture(signCanvas);
            const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true });
            const signSprite = new THREE.Sprite(signMat);
            signSprite.scale.set(1.8, 0.55, 1);
            signSprite.position.set(0, 1.85, 0);
            group.add(signSprite);

        } else if (type === 'rain') {
            // ==========================================
            // 2. 침수 방지 차수판 랙 (방수벽 거치대)
            // ==========================================
            const barrierGeo = new THREE.BoxGeometry(2.4, 1.3, 0.25);
            const barrierMat = new THREE.MeshLambertMaterial({ color: 0x2980b9 });
            const barrier = new THREE.Mesh(barrierGeo, barrierMat);
            barrier.position.y = 0.65;
            barrier.castShadow = true;
            group.add(barrier);

            // 경고 사선 줄무늬
            const stripeGeo = new THREE.BoxGeometry(2.42, 0.24, 0.28);
            const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f });
            const stripe = new THREE.Mesh(stripeGeo, stripeMat);
            stripe.position.y = 0.65;
            group.add(stripe);

            // 고정 지지대 프레임
            const supGeo = new THREE.BoxGeometry(0.12, 1.4, 0.5);
            const supMat = this.materials.metalGray;
            const supL = new THREE.Mesh(supGeo, supMat);
            supL.position.set(-1.15, 0.7, 0);
            const supR = new THREE.Mesh(supGeo, supMat);
            supR.position.set(1.15, 0.7, 0);
            group.add(supL);
            group.add(supR);

            // 안내 팻말 (🌧️ 침수 차수판)
            const signCanvas = document.createElement('canvas');
            signCanvas.width = 256;
            signCanvas.height = 80;
            const sctx = signCanvas.getContext('2d');
            sctx.fillStyle = '#1e293b';
            sctx.roundRect(4, 4, 248, 72, 10);
            sctx.fill();
            sctx.lineWidth = 4;
            sctx.strokeStyle = '#0984e3';
            sctx.stroke();
            sctx.font = 'bold 28px sans-serif';
            sctx.fillStyle = '#38bdf8';
            sctx.textAlign = 'center';
            sctx.textBaseline = 'middle';
            sctx.fillText('🌧️ 침수 차수판', 128, 40);

            const signTex = new THREE.CanvasTexture(signCanvas);
            const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true });
            const signSprite = new THREE.Sprite(signMat);
            signSprite.scale.set(1.8, 0.55, 1);
            signSprite.position.set(0, 1.7, 0);
            group.add(signSprite);

        } else if (type === 'thunder') {
            // ==========================================
            // 3. 산업용 대형 비상 디젤 발전기 (Generator)
            // ==========================================
            // 바닥 안전 노란색/검은색 줄무늬 베이스
            const baseGeo = new THREE.BoxGeometry(2.2, 0.15, 1.8);
            const baseMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.position.y = 0.075;
            base.receiveShadow = true;
            group.add(base);

            // 발전기 주 본체 캐비닛 (육중한 인더스트리얼 다크 카키그린)
            const bodyGeo = new THREE.BoxGeometry(1.8, 1.4, 1.3);
            const bodyMat = new THREE.MeshLambertMaterial({ color: 0x274e36 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.set(0, 0.85, 0);
            body.castShadow = true;
            body.receiveShadow = true;
            group.add(body);

            // 전면 공기 흡입구 빗살 루버 그릴 (Louver Grill)
            const grillGeo = new THREE.BoxGeometry(0.06, 0.9, 0.9);
            const grillMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
            const grill = new THREE.Mesh(grillGeo, grillMat);
            grill.position.set(0.91, 0.85, 0);
            group.add(grill);

            // 제어판 (컨트롤 박스 - 전면 우측)
            const ctrlGeo = new THREE.BoxGeometry(0.7, 0.6, 0.08);
            const ctrlMat = new THREE.MeshLambertMaterial({ color: 0x374151 });
            const ctrl = new THREE.Mesh(ctrlGeo, ctrlMat);
            ctrl.position.set(-0.2, 0.95, 0.66);
            group.add(ctrl);

            // 전압계 계기판 (미니 다이얼 2개)
            const dialGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
            dialGeo.rotateX(Math.PI / 2);
            const dialMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
            const dial1 = new THREE.Mesh(dialGeo, dialMat);
            dial1.position.set(-0.35, 1.05, 0.71);
            const dial2 = new THREE.Mesh(dialGeo, dialMat);
            dial2.position.set(-0.15, 1.05, 0.71);
            group.add(dial1);
            group.add(dial2);

            // 비상 정지 E-STOP 버튼 (빨간 원형)
            const estopGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16);
            estopGeo.rotateX(Math.PI / 2);
            const estopMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
            const estop = new THREE.Mesh(estopGeo, estopMat);
            estop.position.set(0.05, 0.85, 0.71);
            group.add(estop);

            // 상단 배기 파이프 머플러 (곡선 굴뚝 파이프)
            const pipeGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.7, 12);
            const pipeMat = this.materials.metalGray;
            const exhaustPipe = new THREE.Mesh(pipeGeo, pipeMat);
            exhaustPipe.position.set(0.5, 1.85, -0.3);
            group.add(exhaustPipe);

            // 배기 캡
            const capGeo = new THREE.CylinderGeometry(0.14, 0.06, 0.15, 12);
            const exhaustCap = new THREE.Mesh(capGeo, pipeMat);
            exhaustCap.position.set(0.5, 2.25, -0.3);
            group.add(exhaustCap);

            // 상단 비상 경광등 (Beacon)
            const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 16), this.materials.metalGray);
            beaconBase.position.set(-0.5, 1.6, 0);
            group.add(beaconBase);

            const beaconGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.22, 16);
            const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
            const beacon = new THREE.Mesh(beaconGeo, beaconMat);
            beacon.position.set(-0.5, 1.76, 0);
            group.add(beacon);
            group.beacon = beacon;

            // 3D 안내 텍스트 팻말 (⚡ 비상 발전기)
            const signCanvas = document.createElement('canvas');
            signCanvas.width = 256;
            signCanvas.height = 80;
            const sctx = signCanvas.getContext('2d');
            sctx.fillStyle = '#1e293b';
            sctx.roundRect(4, 4, 248, 72, 10);
            sctx.fill();
            sctx.lineWidth = 4;
            sctx.strokeStyle = '#f59e0b';
            sctx.stroke();
            sctx.font = 'bold 28px sans-serif';
            sctx.fillStyle = '#facc15';
            sctx.textAlign = 'center';
            sctx.textBaseline = 'middle';
            sctx.fillText('⚡ 비상 발전기', 128, 40);

            const signTex = new THREE.CanvasTexture(signCanvas);
            const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true });
            const signSprite = new THREE.Sprite(signMat);
            signSprite.scale.set(1.9, 0.6, 1);
            signSprite.position.set(0, 2.3, 0);
            group.add(signSprite);
        }

        return group;
    }

    // [모듈 5] 알루미늄 방수 차수판 (폭우 긴급 조치 시 서쪽 출입구 X=-21에 솟아오름)
    createFloodBarrier() {
        const group = new THREE.Group();

        const barrierWidth = 10.0; // 출입구 너비 (Z축)
        const barrierHeight = 1.1; // 차수판 높이
        const barrierDepth = 0.35; // 차수판 두께

        // 알루미늄 메인 바디
        const bodyGeo = new THREE.BoxGeometry(barrierDepth, barrierHeight, barrierWidth);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = barrierHeight / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // 양측면 H빔 고정 지지대 기둥
        const postGeo = new THREE.BoxGeometry(barrierDepth + 0.15, barrierHeight + 0.3, 0.4);
        const postMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
        const post1 = new THREE.Mesh(postGeo, postMat);
        post1.position.set(0, (barrierHeight + 0.3) / 2, -barrierWidth / 2 + 0.2);
        const post2 = new THREE.Mesh(postGeo, postMat);
        post2.position.set(0, (barrierHeight + 0.3) / 2, barrierWidth / 2 - 0.2);
        group.add(post1);
        group.add(post2);

        // 노란/검정 안전 빗금 경고 텍스처 생성
        const stripeCanvas = document.createElement('canvas');
        stripeCanvas.width = 512;
        stripeCanvas.height = 64;
        const sctx = stripeCanvas.getContext('2d');
        sctx.fillStyle = '#f59e0b';
        sctx.fillRect(0, 0, 512, 64);
        sctx.fillStyle = '#111827';
        for (let x = -64; x < 576; x += 48) {
            sctx.beginPath();
            sctx.moveTo(x, 64);
            sctx.lineTo(x + 24, 64);
            sctx.lineTo(x + 48, 0);
            sctx.lineTo(x + 24, 0);
            sctx.closePath();
            sctx.fill();
        }
        const stripeTex = new THREE.CanvasTexture(stripeCanvas);
        stripeTex.wrapS = THREE.RepeatWrapping;
        stripeTex.repeat.set(2, 1);

        const stripeMat = new THREE.MeshBasicMaterial({ map: stripeTex });
        const stripeGeo = new THREE.PlaneGeometry(barrierWidth - 0.5, 0.35);
        stripeGeo.rotateY(Math.PI / 2); // X축 방향 바라보도록 회전

        // 양면 경고 데칼
        const stripeW = new THREE.Mesh(stripeGeo, stripeMat);
        stripeW.position.set(-barrierDepth / 2 - 0.01, barrierHeight * 0.65, 0);
        const stripeE = new THREE.Mesh(stripeGeo, stripeMat);
        stripeE.position.set(barrierDepth / 2 + 0.01, barrierHeight * 0.65, 0);
        stripeE.rotation.y = Math.PI;
        group.add(stripeW);
        group.add(stripeE);

        // 상단 차수판 안내 팻말
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 300;
        labelCanvas.height = 70;
        const lctx = labelCanvas.getContext('2d');
        lctx.fillStyle = '#0f172a';
        lctx.roundRect(4, 4, 292, 62, 10);
        lctx.fill();
        lctx.lineWidth = 3;
        lctx.strokeStyle = '#0284c7';
        lctx.stroke();
        lctx.font = 'bold 26px sans-serif';
        lctx.fillStyle = '#38bdf8';
        lctx.textAlign = 'center';
        lctx.textBaseline = 'middle';
        lctx.fillText('🌊 침수 방지 차수판 가동중', 150, 35);

        const lTex = new THREE.CanvasTexture(labelCanvas);
        const lMat = new THREE.SpriteMaterial({ map: lTex, transparent: true });
        const lSprite = new THREE.Sprite(lMat);
        lSprite.scale.set(3.2, 0.75, 1);
        lSprite.position.set(0, barrierHeight + 0.6, 0);
        group.add(lSprite);

        return group;
    }

    // [모듈 6] 폭설 시 입고 도로 및 제설 구역에 쌓이는 흰 눈 레이어 및 입체 눈더미 오브젝트
    createSnowGroundLayer() {
        const group = new THREE.Group();

        // 1. 실외 도로/하차장 전체를 덮는 눈 바닥 (가로 18m, 세로 28m)
        const planeGeo = new THREE.PlaneGeometry(18, 27.5);
        planeGeo.rotateX(-Math.PI / 2);
        const planeMat = new THREE.MeshLambertMaterial({
            color: 0xf8fafc,
            transparent: true,
            opacity: 0.95,
        });
        const snowPlane = new THREE.Mesh(planeGeo, planeMat);
        snowPlane.position.set(-30.0, 0.04, 0); // 아스팔트 바로 위에 안착
        snowPlane.receiveShadow = true;
        group.add(snowPlane);

        // 2. ⭐ 제설 발판 위치(X = -24.5, Z = -9.0)에 높게 쌓인 대형 제설용 눈더미 (높이 0.3m)
        const mainSnowMoundGeo = new THREE.CylinderGeometry(1.6, 2.1, 0.32, 16);
        const moundMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const mainMound = new THREE.Mesh(mainSnowMoundGeo, moundMat);
        mainMound.position.set(-24.5, 0.16, -9.0);
        mainMound.receiveShadow = true;
        mainMound.castShadow = true;
        group.add(mainMound);

        // 눈더미 주변 보조 굴곡 돔
        const domeGeo = new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome1 = new THREE.Mesh(domeGeo, moundMat);
        dome1.position.set(-25.6, 0.04, -8.3);
        dome1.scale.set(1.2, 0.45, 1.2);
        group.add(dome1);

        const dome2 = new THREE.Mesh(domeGeo, moundMat);
        dome2.position.set(-23.6, 0.04, -9.8);
        dome2.scale.set(1.1, 0.4, 1.1);
        group.add(dome2);

        // 3. 도로변 곳곳의 입체적인 눈더미들
        const bumpGeo1 = new THREE.DodecahedronGeometry(0.55, 1);
        const bumpGeo2 = new THREE.DodecahedronGeometry(0.38, 1);

        const bumpPositions = [
            [-24.0, 0.18, -6.5],
            [-24.0, 0.18, 6.5],
            [-35.0, 0.2, -10.0],
            [-35.0, 0.2, 10.0],
            [-28.0, 0.15, -11.5],
            [-28.0, 0.15, 11.5],
            [-23.5, 0.15, -3.0],
            [-23.5, 0.15, 3.0]
        ];

        bumpPositions.forEach(p => {
            const bump = new THREE.Mesh(Math.random() > 0.5 ? bumpGeo1 : bumpGeo2, moundMat);
            bump.position.set(p[0], p[1], p[2]);
            bump.receiveShadow = true;
            group.add(bump);
        });

        return group;
    }
}

window.modelFactory = new ModelFactory();

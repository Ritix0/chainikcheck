
    // Переключение между вкладками
    function switchTab(index) {
      const tabs = document.querySelectorAll('.tab-content');
      const btns = document.querySelectorAll('.tabs-nav .tab-btn');
      tabs.forEach((t, i) => {
        if (i === index) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });
      btns.forEach((b, i) => {
        if (i === index) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      if (index === 0) {
        calcCBM();
      } else if (index === 1) {
        calcCustoms();
      } else if (index === 2) {
        calcIncoterms();
      } else if (index === 3) {
        validateDocs();
      } else if (index === 4) {
        calcROP();
      }
    }

    // Текущий выбранный тариф доставки
        // ========================================================
    // ДИНАМИЧЕСКИЕ КУРСЫ ВАЛЮТ ЦБ РФ (ОНЛАЙН + АВТООБНОВЛЕНИЕ)
    // ========================================================
    const liveRates = {
      usd: 84.34,
      cny: 12.54,
      eur: 95.87,
      dateStr: 'сегодня',
      isLive: false,
      mode: 'cbr', // 'cbr', 'cargo' (+3%), 'custom'
      customUsd: null
    };

    async function fetchLiveCurrencyRates() {
      try {
        const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        if (data && data.Valute) {
          liveRates.usd = data.Valute.USD.Value;
          liveRates.cny = data.Valute.CNY.Value;
          liveRates.eur = data.Valute.EUR ? data.Valute.EUR.Value : 95.87;
          
          if (data.Date) {
            const d = new Date(data.Date);
            liveRates.dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
          }
          liveRates.isLive = true;
          updateCurrencyUI();
        }
      } catch (e) {
        // Fallback: работа в офлайн-режиме с актуальными базовыми котировками
        liveRates.isLive = false;
        liveRates.dateStr = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        updateCurrencyUI();
      }
    }

    function updateCurrencyUI() {
      const activeUsd = getActiveUsdRate();
      const activeCny = getActiveCnyRate();

      const usdEl = document.getElementById('live-usd-val');
      const cnyEl = document.getElementById('live-cny-val');
      const eurEl = document.getElementById('live-eur-val');
      const dateEl = document.getElementById('rates-update-date');
      const dotEl = document.getElementById('rates-dot');
      const statusTextEl = document.getElementById('rates-status-text');

      if (usdEl) usdEl.innerText = activeUsd.toFixed(2) + ' ₽';
      const cUsd = document.getElementById('customs-cbr-usd'); if (cUsd) cUsd.innerText = activeUsd.toFixed(2) + ' ₽';
      if (cnyEl) cnyEl.innerText = activeCny.toFixed(2) + ' ₽';
      const cCny = document.getElementById('customs-cbr-cny'); if (cCny) cCny.innerText = activeCny.toFixed(2) + ' ₽';
      if (eurEl) eurEl.innerText = liveRates.eur.toFixed(2) + ' ₽';
      if (dateEl) {
        dateEl.innerText = liveRates.isLive 
          ? 'ЦБ РФ онлайн (' + liveRates.dateStr + ')'
          : 'актуально на ' + liveRates.dateStr;
      }
      if (dotEl) {
        dotEl.style.background = liveRates.isLive ? '#10b981' : '#f59e0b';
      }
      if (statusTextEl) {
        statusTextEl.innerText = liveRates.isLive ? 'Курсы ЦБ РФ онлайн:' : 'Курсы ЦБ РФ (базовые):';
      }

      calcCBM();
      calcCustoms();
      if (typeof calcCurrencyControl === 'function') calcCurrencyControl();
    }

    function getActiveUsdRate() {
      if (liveRates.mode === 'custom' && liveRates.customUsd > 0) {
        return liveRates.customUsd;
      }
      if (liveRates.mode === 'cargo') {
        return liveRates.usd * 1.03; // Наценка посредников карго 3%
      }
      return liveRates.usd;
    }

    function getActiveCnyRate() {
      if (liveRates.mode === 'cargo') {
        return liveRates.cny * 1.03;
      }
      return liveRates.cny;
    }

    function changeCurrencyMode() {
      const sel = document.getElementById('currency-mode-select');
      const customInput = document.getElementById('custom-usd-input');
      liveRates.mode = sel.value;

      if (sel.value === 'custom') {
        if (customInput) {
          customInput.style.display = 'inline-block';
          customInput.value = Math.round(getActiveUsdRate());
          liveRates.customUsd = parseFloat(customInput.value) || liveRates.usd;
        }
      } else {
        if (customInput) customInput.style.display = 'none';
      }
      updateCurrencyUI();
    }

    // Текущий выбранный тариф доставки
    let currentTariff = 'auto-fast';

    // Тарифные сетки по градациям плотности из Справочника Кворка #31
    function getTariffRateByDensity(density, tariffKey) {
      // Для легких кубатурных грузов (<100 кг/м3) карго считает по объему за м3
      if (density < 100) {
        const cbmRates = {
          'auto-fast': 280, // $ за м3
          'auto-std': 240,
          'rail': 190,
          'air': 450
        };
        return { isCbm: true, ratePerCbm: cbmRates[tariffKey], displayRate: '$' + cbmRates[tariffKey] + ' / м³' };
      }

      // Тариф за кг по ступеням плотности (авто быстрое, стандарт авто, жд, авиа)
      let r = 2.8;
      if (tariffKey === 'auto-fast') {
        if (density >= 400) r = 1.70;
        else if (density >= 300) r = 1.85;
        else if (density >= 250) r = 2.10;
        else if (density >= 200) r = 2.40;
        else if (density >= 150) r = 2.80;
        else if (density >= 120) r = 3.30;
        else r = 3.90; // 100-120
      } else if (tariffKey === 'auto-std') {
        if (density >= 400) r = 1.40;
        else if (density >= 300) r = 1.50;
        else if (density >= 250) r = 1.75;
        else if (density >= 200) r = 2.00;
        else if (density >= 150) r = 2.40;
        else if (density >= 120) r = 2.80;
        else r = 3.30;
      } else if (tariffKey === 'rail') {
        if (density >= 400) r = 1.20;
        else if (density >= 300) r = 1.35;
        else if (density >= 250) r = 1.55;
        else if (density >= 200) r = 1.80;
        else if (density >= 150) r = 2.10;
        else if (density >= 120) r = 2.40;
        else r = 2.80;
      } else if (tariffKey === 'air') {
        if (density >= 400) r = 5.80;
        else if (density >= 300) r = 6.20;
        else if (density >= 250) r = 6.80;
        else if (density >= 200) r = 7.50;
        else if (density >= 150) r = 8.20;
        else if (density >= 120) r = 9.00;
        else r = 10.00;
      }
      return { isCbm: false, ratePerKg: r, displayRate: '$' + r.toFixed(2) + ' / кг' };
    }

    const tariffMeta = {
      'auto-fast': { name: 'Быстрое авто', days: '13-18 дней' },
      'auto-std': { name: 'Стандарт авто', days: '18-25 дней' },
      'rail': { name: 'ЖД контейнер', days: '25-35 дней' },
      'air': { name: 'Авиа доставка', days: '5-8 дней' }
    };

    // Выбор тарифа карго
    function selectTariff(tariffKey) {
      currentTariff = tariffKey;
      document.querySelectorAll('.tariff-option').forEach(el => el.classList.remove('active'));
      const activeEl = document.getElementById('tariff-' + tariffKey);
      if (activeEl) activeEl.classList.add('active');
      calcCBM();
    }

    // 1. Калькулятор CBM и доставки (Сметная модель ВЭД под ключ)
    function calcCBM() {
      const l = parseFloat(document.getElementById('box-l').value) || 0;
      const w = parseFloat(document.getElementById('box-w').value) || 0;
      const h = parseFloat(document.getElementById('box-h').value) || 0;
      const count = parseInt(document.getElementById('boxes-count').value) || 0;
      const weight = parseFloat(document.getElementById('total-weight').value) || 0;
      const valInput = parseFloat(document.getElementById('cargo-val').value) || 0;
      const valCurr = document.getElementById('cargo-val-curr') ? document.getElementById('cargo-val-curr').value : 'USD';
      const items = parseInt(document.getElementById('items-count').value) || 1;
      const packRatePerBox = parseFloat(document.getElementById('cargo-packaging').value) || 0;
      const insuranceRate = parseFloat(document.getElementById('cargo-insurance').value) || 0;
      const includeTerminal = document.getElementById('include-terminal-fee') ? document.getElementById('include-terminal-fee').checked : true;

      const usdRate = getActiveUsdRate();
      const cnyRate = getActiveCnyRate();

      // Геометрия коробок и партии
      const boxVolume = (l * w * h) / 1000000;
      const totalCbm = boxVolume * count;
      const density = totalCbm > 0 ? (weight / totalCbm) : 0;
      const boxWeight = count > 0 ? (weight / count) : 0;

      document.getElementById('chip-box-vol').innerText = boxVolume.toFixed(3) + ' м³';
      document.getElementById('chip-box-wt').innerText = boxWeight.toFixed(1) + ' кг';
      document.getElementById('chip-total-cbm').innerText = totalCbm.toFixed(2) + ' CBM (м³)';

      document.getElementById('res-cbm').innerText = totalCbm.toFixed(2) + ' м³';
      document.getElementById('res-density').innerText = density.toFixed(1) + ' кг/м³';

      // Пересчет закупки в рубли и доллары
      let purchaseCostRub = 0;
      let purchaseCostUsd = 0;
      if (valCurr === 'CNY') {
        purchaseCostRub = valInput * cnyRate;
        purchaseCostUsd = usdRate > 0 ? (purchaseCostRub / usdRate) : 0;
        const subEl = document.getElementById('cargo-val-sub');
        if (subEl) subEl.innerText = '~' + Math.round(purchaseCostRub).toLocaleString() + ' ₽ по курсу ЦБ РФ';
      } else {
        purchaseCostUsd = valInput;
        purchaseCostRub = valInput * usdRate;
        const subEl = document.getElementById('cargo-val-sub');
        if (subEl) subEl.innerText = '~' + Math.round(purchaseCostRub).toLocaleString() + ' ₽ по курсу ЦБ РФ';
      }

      // Определение тарифа и бейджа плотности
      const badge = document.getElementById('cbm-density-badge');
      const insightText = document.getElementById('density-insight-text');

      if (density < 100) {
        badge.innerText = 'Кубатурный груз (<100 кг/м³)';
        badge.style.background = '#fff1f2';
        badge.style.color = '#e11d48';
        badge.style.borderColor = 'rgba(225, 29, 72, 0.25)';
        insightText.innerHTML = '<strong>Внимание: Кубатурный расчет!</strong> Плотность партии ' + density.toFixed(0) + ' кг/м³ ниже 100 кг/м³. Перевозчики считают такие грузы по объему за м³, а не по весу. Обязательно требуйте расчет за CBM без навязывания завышенного объемного веса.';
      } else if (density >= 300) {
        badge.innerText = 'Тяжелый плотный (>300 кг/м³)';
        badge.style.background = '#f0fdf4';
        badge.style.color = '#15803d';
        badge.style.borderColor = 'rgba(21, 128, 61, 0.25)';
        insightText.innerHTML = '<strong>Отличная плотность:</strong> Ваш груз тяжелый и плотный (' + density.toFixed(0) + ' кг/м³). Вы получаете минимальную ставку за килограмм у любого карго-перевозчика.';
      } else if (density >= 150) {
        badge.innerText = 'Стандартная плотность';
        badge.style.background = '#f0f9ff';
        badge.style.color = '#0284c7';
        badge.style.borderColor = 'rgba(2, 132, 199, 0.25)';
        insightText.innerHTML = '<strong>Совет по плотности:</strong> Плотность партии ' + density.toFixed(0) + ' кг/м³ попадает в базовый тариф. Если сжать коробки на 4-5 см по высоте (увеличив плотность до 200+ кг/м³), ставка снизится на $0.3-0.5 за кг, сэкономив до $180.';
      } else {
        badge.innerText = 'Легкий объемный (100-150 кг/м³)';
        badge.style.background = '#fff7ed';
        badge.style.color = '#c2410c';
        badge.style.borderColor = 'rgba(194, 65, 12, 0.25)';
        insightText.innerHTML = '<strong>Внимание к плотности:</strong> Плотность груза ' + density.toFixed(0) + ' кг/м³ ниже 150 кг/м³. Перевозчик начислит надбавку за объемность. Рекомендуется вакуумировать товар или оптимизировать укладку коробок.';
      }

      // Обновляем ставки на карточках тарифов
      for (const tKey in tariffMeta) {
        const rateEl = document.getElementById('rate-' + tKey);
        if (rateEl) {
          const tInfo = getTariffRateByDensity(density, tKey);
          rateEl.innerText = '~' + tInfo.displayRate;
        }
      }

      // Расчет стоимости фрахта
      const currentTariffInfo = getTariffRateByDensity(density, currentTariff);
      let costFreightUsd = 0;
      if (currentTariffInfo.isCbm) {
        costFreightUsd = totalCbm * currentTariffInfo.ratePerCbm;
      } else {
        costFreightUsd = weight * currentTariffInfo.ratePerKg;
      }
      const costFreightRub = costFreightUsd * usdRate;

      // Скрытые сборы: Упаковка, Страховка, Терминал Москва
      const packCostUsd = count * packRatePerBox;
      const packCostRub = packCostUsd * usdRate;

      const insuranceCostUsd = purchaseCostUsd * insuranceRate;
      const insuranceCostRub = insuranceCostUsd * usdRate;

      const terminalRatePerKg = 3.5; // ТЯК Люблино / Южные Ворота
      const terminalCostRub = includeTerminal ? (weight * terminalRatePerKg) : 0;
      const terminalCostUsd = usdRate > 0 ? (terminalCostRub / usdRate) : 0;

      // Итоговая доставка и полный бюджет
      const totalDeliveryUsd = costFreightUsd + packCostUsd + insuranceCostUsd + terminalCostUsd;
      const totalDeliveryRub = costFreightRub + packCostRub + insuranceCostRub + terminalCostRub;

      const grandTotalRub = purchaseCostRub + totalDeliveryRub;
      const grandTotalUsd = purchaseCostUsd + totalDeliveryUsd;

      // Себестоимость на 1 единицу товара
      const perItemDeliveryUsd = totalDeliveryUsd / items;
      const perItemDeliveryRub = totalDeliveryRub / items;
      const perItemTotalUnitRub = grandTotalRub / items;

      // Заполняем результат в DOM
      document.getElementById('res-applied-rate').innerText = currentTariffInfo.displayRate;
      document.getElementById('res-transit-days').innerText = tariffMeta[currentTariff].days;

      document.getElementById('res-per-item').innerText = '~' + perItemDeliveryUsd.toFixed(2) + ' $';
      document.getElementById('res-per-item-rub').innerText = '~' + Math.round(perItemDeliveryRub).toLocaleString() + ' ₽ на ед.';

      document.getElementById('res-total-unit-cost').innerText = '~' + Math.round(perItemTotalUnitRub).toLocaleString() + ' ₽';

      document.getElementById('res-total-delivery').innerText = '$' + Math.round(totalDeliveryUsd).toLocaleString();
      document.getElementById('res-total-rub').innerText = '~' + Math.round(totalDeliveryRub).toLocaleString() + ' ₽ по курсу';

      document.getElementById('res-grand-total').innerText = '~' + Math.round(grandTotalRub).toLocaleString() + ' ₽';
      document.getElementById('res-grand-total-sub').innerText = '$' + Math.round(grandTotalUsd).toLocaleString() + ' под ключ';

      document.getElementById('res-freight-cost').innerText = '~$' + Math.round(costFreightUsd).toLocaleString() + ' (' + Math.round(costFreightRub).toLocaleString() + ' ₽)';
      document.getElementById('res-pack-cost').innerText = '~$' + Math.round(packCostUsd).toLocaleString() + ' (' + Math.round(packCostRub).toLocaleString() + ' ₽)';
      document.getElementById('res-insurance-cost').innerText = '~$' + Math.round(insuranceCostUsd).toLocaleString() + ' (' + Math.round(insuranceCostRub).toLocaleString() + ' ₽)';
      document.getElementById('res-terminal-cost').innerText = Math.round(terminalCostRub).toLocaleString() + ' ₽';
      document.getElementById('res-purchase-cost').innerText = '~$' + Math.round(purchaseCostUsd).toLocaleString() + ' (' + Math.round(purchaseCostRub).toLocaleString() + ' ₽)';

      // Динамическое обновление справочника CBM в реальном времени
      const kbBoxVol = document.getElementById('kb-box-vol');
      if (kbBoxVol) kbBoxVol.innerText = boxVolume.toFixed(3);
      const kbTotalCbm = document.getElementById('kb-total-cbm');
      if (kbTotalCbm) kbTotalCbm.innerText = totalCbm.toFixed(2);
      const kbBoxesCnt = document.getElementById('kb-boxes-cnt');
      if (kbBoxesCnt) kbBoxesCnt.innerText = count;
      const kbTotalWt = document.getElementById('kb-total-wt');
      if (kbTotalWt) kbTotalWt.innerText = weight;
      const kbDensityCbm = document.getElementById('kb-density-cbm');
      if (kbDensityCbm) kbDensityCbm.innerText = totalCbm.toFixed(2);
      const kbDensityVal = document.getElementById('kb-density-val');
      if (kbDensityVal) kbDensityVal.innerText = density.toFixed(1);
      const kbDensityStatus = document.getElementById('kb-density-status');
      if (kbDensityStatus && badge) kbDensityStatus.innerText = badge.innerText;
      const kbPurchaseVal = document.getElementById('kb-purchase-val');
      if (kbPurchaseVal) kbPurchaseVal.innerText = (valCurr === 'CNY' ? '¥' : '$') + valInput.toLocaleString();
      const kbFreightVal = document.getElementById('kb-freight-val');
      if (kbFreightVal) kbFreightVal.innerText = '$' + Math.round(costFreightUsd + packCostUsd + insuranceCostUsd).toLocaleString();
      const kbBudgetVal = document.getElementById('kb-budget-val');
      if (kbBudgetVal) kbBudgetVal.innerText = '~' + Math.round(grandTotalRub).toLocaleString() + ' ₽';
      const kbUnitCost = document.getElementById('kb-unit-cost');
      if (kbUnitCost) kbUnitCost.innerText = '~' + Math.round(perItemTotalUnitRub).toLocaleString() + ' ₽';

    }


        // 2. Таможенный калькулятор (ЕТТ ЕАЭС, курсы ЦБ РФ, шкала ПП РФ № 342)
    const customsCatData = {
      clothing: {
        title: 'Одежда и текстильные изделия (Группы 61, 62)',
        hsGroup: '6101 - 6211',
        defaultDuty: 10,
        regulation: 'ТР ТС 017/2011 (О безопасности легпрома: Декларация / Сертификат)',
        marking: 'Обязательная маркировка Честный Знак (DataMatrix) до подачи ДТ',
        fsb: 'Не требуется',
        riskPrice: 'от $12.0 / кг'
      },
      shoes: {
        title: 'Обувь и комплектующие (Группа 64)',
        hsGroup: '6401 - 6405',
        defaultDuty: 10,
        regulation: 'ТР ТС 017/2011 (Сертификат на детскую, Декларация на взрослую)',
        marking: '100% обуви подлежит маркировке Честный Знак (DataMatrix)',
        fsb: 'Не требуется',
        riskPrice: 'от $8.0 / пара'
      },
      electronics: {
        title: 'Беспроводная электроника и Bluetooth-гаджеты (Группа 85)',
        hsGroup: '8518, 8517',
        defaultDuty: 0,
        regulation: 'ТР ТС 020/2011 (ЭМС) + ТР ЕАЭС 037/2016 (RoHS)',
        marking: 'Честный Знак не требуется',
        fsb: 'Требуется нотификация ФСБ РФ (встроенное шифрование/радиоканал)',
        riskPrice: 'от $15.0 / кг'
      },
      appliances: {
        title: 'Бытовая техника и электроприборы (Группа 85)',
        hsGroup: '8509, 8516',
        defaultDuty: 5,
        regulation: 'ТР ТС 004/2011 (Низковольтное) + ТР ТС 020/2011 (ЭМС)',
        marking: 'Честный Знак не требуется',
        fsb: 'Требуется только при наличии Wi-Fi/Bluetooth',
        riskPrice: 'от $6.0 / кг'
      },
      chips: {
        title: 'Серверное оборудование, процессоры и микросхемы (Группы 84, 85)',
        hsGroup: '8471, 8542',
        defaultDuty: 0,
        regulation: 'ТР ТС 004/2011, ТР ТС 020/2011',
        marking: 'Честный Знак не требуется',
        fsb: 'Требуется нотификация ФСБ при поддержке криптографии',
        riskPrice: 'от $50.0 / кг'
      },
      toys: {
        title: 'Детские игрушки и наборы (Группа 95)',
        hsGroup: '9503 00',
        defaultDuty: 5,
        regulation: 'ТР ТС 008/2011 (Строго Сертификат соответствия, испытания)',
        marking: 'Знак ЕАС на упаковке и изделии',
        fsb: 'Не требуется',
        riskPrice: 'от $4.5 / кг'
      },
      plastic: {
        title: 'Изделия из пластмасс и полимеров (Группа 39)',
        hsGroup: '3926',
        defaultDuty: 6.5,
        regulation: 'Отказное письмо или декларация ГОСТ Р (при контакте с пищей)',
        marking: 'Маркировка производителя',
        fsb: 'Не требуется',
        riskPrice: 'от $2.5 / кг'
      },
      kitchen: {
        title: 'Посуда и кухонные принадлежности (Группы 73, 39)',
        hsGroup: '7323, 3924',
        defaultDuty: 10,
        regulation: 'Декларация о соответствии ГОСТ Р (ПП РФ № 2425)',
        marking: 'Пищевой допуск (знак бокала и вилки)',
        fsb: 'Не требуется',
        riskPrice: 'от $3.0 / кг'
      },
      auto: {
        title: 'Автозапчасти и аксессуары (Группа 87)',
        hsGroup: '8708',
        defaultDuty: 5,
        regulation: 'ТР ТС 018/2011 (О безопасности колесных транспортных средств)',
        marking: 'Знак ЕАС',
        fsb: 'Не требуется',
        riskPrice: 'от $4.0 / кг'
      },
      furniture: {
        title: 'Мебель и светильники (Группа 94)',
        hsGroup: '9403, 9405',
        defaultDuty: 9,
        regulation: 'ТР ТС 025/2012 (О безопасности мебельной продукции)',
        marking: 'Инструкция по сборке на русском языке',
        fsb: 'Не требуется',
        riskPrice: 'от $2.0 / кг'
      },
      custom: {
        title: 'Индивидуальная категория (ручная ставка)',
        hsGroup: 'По запросу',
        defaultDuty: 10,
        regulation: 'Требуется анализ по 10-значному коду ТН ВЭД ЕАЭС',
        marking: 'Уточняется по перечням ГИС МТ ЦРПТ',
        fsb: 'Уточняется по реестру ЕЭК',
        riskPrice: 'Индивидуально'
      }
    };

    function onCustomsCategoryChange() {
      const catKey = document.getElementById('customs-cat').value;
      const customWrap = document.getElementById('custom-duty-wrap');
      if (catKey === 'custom') {
        customWrap.style.display = 'block';
      } else {
        customWrap.style.display = 'none';
      }

      // Обновление нетарифной карточки
      const info = customsCatData[catKey] || customsCatData.clothing;
      const ntTitle = document.getElementById('nt-title');
      const ntDetails = document.getElementById('nt-details');
      if (ntTitle && ntDetails) {
        ntTitle.innerText = 'Нетарифный контроль: ' + info.title;
        ntDetails.innerHTML = 
          '• <strong>Техрегламент:</strong> ' + info.regulation + '<br>' +
          '• <strong>Честный Знак:</strong> ' + info.marking + '<br>' +
          '• <strong>Нотификация ФСБ:</strong> ' + info.fsb + '<br>' +
          '• <strong>Индикатор риска КТС (проходная цена):</strong> ' + info.riskPrice;
      }

      calcCustoms();
    }

    function getCustomsExchangeRate(currency) {
      if (currency === 'USD') return liveRates.usd;
      if (currency === 'CNY') return liveRates.cny;
      if (currency === 'EUR') return liveRates.eur;
      return 1.0; // RUB
    }

    function calcCustoms() {
      const currency = document.getElementById('customs-currency').value;
      const invoiceVal = parseFloat(document.getElementById('customs-invoice-val').value) || 0;
      const freightVal = parseFloat(document.getElementById('customs-freight-val').value) || 0;
      const rate = getCustomsExchangeRate(currency);

      const totalForeign = invoiceVal + freightVal;
      const customsCostRub = totalForeign * rate;

      // Определение ставки пошлины
      const catSelect = document.getElementById('customs-cat');
      const catKey = catSelect.value;
      let dutyRate = 10;
      if (catKey === 'custom') {
        dutyRate = parseFloat(document.getElementById('custom-duty-input').value) || 0;
      } else {
        const info = customsCatData[catKey];
        dutyRate = info ? info.defaultDuty : 10;
      }

      // Определение ставки НДС
      const ndsRate = parseFloat(document.getElementById('customs-nds-select').value) || 20;

      // 1. Пошлина
      const dutySum = (customsCostRub * dutyRate) / 100;

      // 2. Налоговая база НДС = Таможенная стоимость + Ввозная пошлина
      const ndsBase = customsCostRub + dutySum;
      const ndsSum = (ndsBase * ndsRate) / 100;

      // 3. Таможенный сбор по шкале ПП РФ № 342 (электронное декларирование)
      let fee = 1069;
      let feeBracket = 'до 200 000 ₽';
      if (customsCostRub > 7000000) {
        fee = 30000;
        feeBracket = 'свыше 7 000 000 ₽';
      } else if (customsCostRub > 5000000) {
        fee = 21380;
        feeBracket = 'от 5 000 000 до 7 000 000 ₽';
      } else if (customsCostRub > 2500000) {
        fee = 17104;
        feeBracket = 'от 2 500 000 до 5 000 000 ₽';
      } else if (customsCostRub > 1200000) {
        fee = 11759;
        feeBracket = 'от 1 200 000 до 2 500 000 ₽';
      } else if (customsCostRub > 450000) {
        fee = 4276;
        feeBracket = 'от 450 000 до 1 200 000 ₽';
      } else if (customsCostRub > 200000) {
        fee = 2138;
        feeBracket = 'от 200 000 до 450 000 ₽';
      }

      const totalCustomsPayments = dutySum + ndsSum + fee;
      const fiscalBurdenPct = customsCostRub > 0 ? ((totalCustomsPayments / customsCostRub) * 100).toFixed(1) : '0';

      // Обновление превью таможенной стоимости слева
      const costPreviewEl = document.getElementById('customs-cost-preview');
      const rateBadgeEl = document.getElementById('customs-rate-badge');
      if (costPreviewEl) {
        const symbol = currency === 'USD' ? '$' : (currency === 'CNY' ? '¥' : (currency === 'EUR' ? '€' : '₽'));
        if (currency === 'RUB') {
          costPreviewEl.innerText = Math.round(customsCostRub).toLocaleString() + ' ₽';
        } else {
          costPreviewEl.innerText = symbol + totalForeign.toLocaleString() + ' = ' + Math.round(customsCostRub).toLocaleString() + ' ₽';
        }
      }
      if (rateBadgeEl) {
        if (currency === 'RUB') {
          rateBadgeEl.innerText = 'Валюта РФ (без пересчета)';
        } else {
          rateBadgeEl.innerText = 'Курс ЦБ: ' + rate.toFixed(2) + ' ₽ (' + liveRates.dateStr + ')';
        }
      }

      // Обновление плашки курсов в шапке Вкладки 2
      const cUsd = document.getElementById('customs-cbr-usd');
      const cCny = document.getElementById('customs-cbr-cny');
      const cEur = document.getElementById('customs-cbr-eur');
      const cDate = document.getElementById('customs-cbr-date');
      const cDot = document.getElementById('customs-rates-dot');
      if (cUsd) cUsd.innerText = liveRates.usd.toFixed(2) + ' ₽';
      if (cCny) cCny.innerText = liveRates.cny.toFixed(2) + ' ₽';
      if (cEur) cEur.innerText = liveRates.eur.toFixed(2) + ' ₽';
      if (cDate) cDate.innerText = liveRates.isLive ? 'онлайн на ' + liveRates.dateStr : 'на ' + liveRates.dateStr;
      if (cDot) cDot.style.background = liveRates.isLive ? '#10b981' : '#f59e0b';

      // Обновление правых метрик
      document.getElementById('res-tc-rub').innerText = Math.round(customsCostRub).toLocaleString() + ' ₽';
      document.getElementById('res-duty-rate').innerText = dutyRate + '%';
      document.getElementById('res-duty-sum').innerText = Math.round(dutySum).toLocaleString() + ' ₽';
      document.getElementById('res-nds-base').innerText = Math.round(ndsBase).toLocaleString() + ' ₽';
      document.getElementById('res-nds-rate-label').innerText = ndsRate + '%';
      document.getElementById('res-nds-sum').innerText = Math.round(ndsSum).toLocaleString() + ' ₽';
      document.getElementById('res-customs-fee').innerText = fee.toLocaleString() + ' ₽ (' + feeBracket + ')';
      document.getElementById('res-customs-total').innerText = Math.round(totalCustomsPayments).toLocaleString() + ' ₽';
      document.getElementById('res-customs-total-sub').innerText = 'подлежит единому перечислению на ЕЛС ФТС РФ';
      document.getElementById('res-customs-burden').innerText = fiscalBurdenPct + '% от таможенной стоимости';

      // Динамическое обновление справочника Таможни в реальном времени
      const kbCustInv = document.getElementById('kb-cust-inv');
      if (kbCustInv) kbCustInv.innerText = (currency === 'CNY' ? '¥' : (currency === 'EUR' ? '€' : (currency === 'RUB' ? '₽' : '$'))) + invoiceVal.toLocaleString();
      const kbCustFr = document.getElementById('kb-cust-fr');
      if (kbCustFr) kbCustFr.innerText = (currency === 'CNY' ? '¥' : (currency === 'EUR' ? '€' : (currency === 'RUB' ? '₽' : '$'))) + freightVal.toLocaleString();
      const kbCustTcRub = document.getElementById('kb-cust-tc-rub');
      if (kbCustTcRub) kbCustTcRub.innerText = Math.round(customsCostRub).toLocaleString() + ' ₽';
      const kbCustRate = document.getElementById('kb-cust-rate');
      if (kbCustRate) kbCustRate.innerText = rate.toFixed(2) + ' ₽';
      const kbDutyPct = document.getElementById('kb-duty-pct');
      if (kbDutyPct) kbDutyPct.innerText = dutyRate + '%';
      const kbDutyVal = document.getElementById('kb-duty-val');
      if (kbDutyVal) kbDutyVal.innerText = Math.round(dutySum).toLocaleString() + ' ₽';
      const kbNdsBase = document.getElementById('kb-nds-base');
      if (kbNdsBase) kbNdsBase.innerText = Math.round(ndsBase).toLocaleString() + ' ₽';
      const kbNdsVal = document.getElementById('kb-nds-val');
      if (kbNdsVal) kbNdsVal.innerText = Math.round(ndsSum).toLocaleString() + ' ₽';
      const kbFeeVal = document.getElementById('kb-fee-val');
      if (kbFeeVal) kbFeeVal.innerText = fee.toLocaleString() + ' ₽';
      const kbTotalCustoms = document.getElementById('kb-total-customs');
      if (kbTotalCustoms) kbTotalCustoms.innerText = Math.round(totalCustomsPayments).toLocaleString() + ' ₽';

    }

// 3. Инкотермс-2020 и Валютный контроль банка РФ (Инструкция № 181-И)
    const incoData = {
      FOB: {
        badge: 'FOB Рекомендован',
        badgeClass: 'green',
        transport: 'Морской / речной транспорт',
        riskPoint: 'Борт судна в порту Китая (Ningbo / Shanghai / Shenzhen)',
        riskSub: 'до момента погрузки на борт все риски несет фабрика в КНР',
        exportPay: 'Оплачивает поставщик (лицензия КНР)',
        freightPay: 'Оплачивает покупатель (прямой фрахт)',
        insurancePay: 'Покупатель (морское карго по желанию)',
        terminalPay: 'Покупатель (прямой тариф линии в РФ)',
        customsPay: 'Покупатель (пошлина + НДС 20% в РФ)',
        warning: '<strong>Совет юриста по FOB:</strong> Золотой стандарт ВЭД с Китаем. Фабрика сама закрывает экспортную декларацию и получает возврат НДС в КНР. Покупатель сам контролирует морскую линию и полностью защищен от скрытых портовых сборов.',
        clause: 'FOB Ningbo port, China, Incoterms 2020',
        steps: [
          { name: '1. Производство, упаковка и маркировка в КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '2. Погрузка на транспорт на фабрике', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '3. Экспортная таможенная очистка в КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '4. Погрузка на борт судна в порту Китая', party: 'Переход рисков', type: 'risk-shift' },
          { name: '5. Международный морской фрахт в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '6. Выгрузка и терминальные сборы (THC) в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '7. Таможенная очистка (пошлина + НДС) в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '8. Доставка до склада покупателя в РФ', party: 'Покупатель (Импортер)', type: 'buyer' }
        ]
      },
      EXW: {
        badge: 'EXW Критический риск',
        badgeClass: 'red',
        transport: 'Любой вид транспорта',
        riskPoint: 'Склад фабрики в Китае до погрузки на транспорт',
        riskSub: 'все риски переходят в момент предоставления товара у ворот завода',
        exportPay: 'Оплачивает покупатель (ловушка отсутствия лицензии)',
        freightPay: 'Оплачивает покупатель',
        insurancePay: 'Оплачивает покупатель',
        terminalPay: 'Оплачивает покупатель',
        customsPay: 'Оплачивает покупатель',
        warning: '<strong>Критический риск EXW:</strong> У многих мелких фабрик в Китае (особенно на 1688) нет лицензии на ВЭД. Если товар задержат на таможне КНР, фабрика откажется возвращать деньги. Категорически не рекомендуется начинающим импортерам.',
        clause: 'EXW Seller warehouse, Yiwu, Zhejiang, China, Incoterms 2020',
        steps: [
          { name: '1. Производство товара на заводе в КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '2. Погрузка на транспорт на заводе', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '3. Переход всех рисков на покупателя', party: 'Переход рисков', type: 'risk-shift' },
          { name: '4. Доставка до границы и затаможка в КНР', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '5. Международная перевозка в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '6. Терминальные расходы и СВХ в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '7. Таможенное декларирование и НДС в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '8. Доставка на склад получателя в РФ', party: 'Покупатель (Импортер)', type: 'buyer' }
        ]
      },
      FCA: {
        badge: 'FCA Рекомендован (ЖД / Авто)',
        badgeClass: 'green',
        transport: 'Любой вид (авто, жд, авиа, сборный груз)',
        riskPoint: 'Склад экспедитора / станция в КНР после затаможки',
        riskSub: 'риск переходит после передачи первому перевозчику с оформленным экспортом',
        exportPay: 'Оплачивает поставщик (экспорт КНР закрыт)',
        freightPay: 'Оплачивает покупатель',
        insurancePay: 'Оплачивает покупатель',
        terminalPay: 'Оплачивает покупатель',
        customsPay: 'Оплачивает покупатель',
        warning: '<strong>Совет юриста по FCA:</strong> Лучший базис для прямых железнодорожных контейнерных поездов и автофуров через Забайкальск. Фабрика обязана выпустить экспортную декларацию КНР, а покупатель полностью контролирует тариф логистики.',
        clause: 'FCA Forwarder Warehouse, Shenzhen, China, Incoterms 2020',
        steps: [
          { name: '1. Производство и упаковка на заводе в КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '2. Доставка до терминала / станции в КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '3. Экспортное оформление на таможне КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '4. Передача первому перевозчику в Китае', party: 'Переход рисков', type: 'risk-shift' },
          { name: '5. ЖД или авто перевозка в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '6. Терминал прибытия (Ворсино / Белый Раст)', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '7. Таможенное оформление и НДС в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '8. Доставка до склада в РФ', party: 'Покупатель (Импортер)', type: 'buyer' }
        ]
      },
      CIF: {
        badge: 'CIF Риск скрытых поборов',
        badgeClass: 'orange',
        transport: 'Только морской и речной транспорт',
        riskPoint: 'Борт судна в порту отгрузки в Китае',
        riskSub: 'риск переходит в Китае, хотя фрахт оплатила фабрика',
        exportPay: 'Оплачивает поставщик',
        freightPay: 'Включен в цену (дешевый агент фабрики)',
        insurancePay: 'Оформляет продавец (минимальное Clause C)',
        terminalPay: 'Покупатель (риск поборов CISF до 300 000 ₽)',
        customsPay: 'Покупатель (пошлина + НДС в РФ)',
        warning: '<strong>Логистический капкан CIF:</strong> Фабрика нанимает самого дешевого экспедитора в Китае. По прибытии контейнера во Владивосток или Новороссийск агент выставляет покупателю счет за выдачу коносамента и портовые сборы на сотни тысяч рублей.',
        clause: 'CIF Vladivostok commercial port, Russia, Incoterms 2020',
        steps: [
          { name: '1. Производство и затаможка в Китае', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '2. Погрузка на борт судна в порту КНР', party: 'Переход рисков', type: 'risk-shift' },
          { name: '3. Морской фрахт до порта РФ', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '4. Базовая морская страховка груза', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '5. Выгрузка в порту РФ (ловушка сборов CISF/THC)', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '6. Таможенная пошлина и НДС в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '7. Вывоз контейнера из порта на склад в РФ', party: 'Покупатель (Импортер)', type: 'buyer' }
        ]
      },
      CIP: {
        badge: 'CIP Средний риск (All Risks)',
        badgeClass: 'yellow',
        transport: 'Любой вид транспорта (мультимодал, авиа, жд)',
        riskPoint: 'Передача первому перевозчику в Китае',
        riskSub: 'фабрика обязана оформить полис с максимальным покрытием Institute Cargo Clauses A',
        exportPay: 'Оплачивает поставщик',
        freightPay: 'Оплачивает поставщик',
        insurancePay: 'Оплачивает продавец (максимальная страховка)',
        terminalPay: 'По договоренности в контракте',
        customsPay: 'Покупатель (пошлина + НДС в РФ)',
        warning: '<strong>Особенность CIP по Incoterms 2020:</strong> В отличие от CIF, продавец обязан оформить страховку с максимальным покрытием всех рисков (All Risks). Удобно для дорогостоящей электроники и станков.',
        clause: 'CIP Moscow terminal Vorsino, Russia, Incoterms 2020',
        steps: [
          { name: '1. Производство и экспортная очистка в КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '2. Передача перевозчику в Китае', party: 'Переход рисков', type: 'risk-shift' },
          { name: '3. Оформление страховки All Risks', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '4. Магистральная перевозка до РФ', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '5. Терминал прибытия в РФ', party: 'По договоренности', type: 'buyer' },
          { name: '6. Таможенное декларирование в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '7. Доставка до склада получателя в РФ', party: 'Покупатель (Импортер)', type: 'buyer' }
        ]
      },
      DAP: {
        badge: 'DAP Доставка до склада РФ',
        badgeClass: 'green',
        transport: 'Любой вид транспорта (авто, жд)',
        riskPoint: 'На прибывшем транспорте на складе в РФ до выгрузки',
        riskSub: 'фабрика несет все риски гибели груза вплоть до прибытия на ваш склад',
        exportPay: 'Оплачивает поставщик',
        freightPay: 'Оплачивает поставщик',
        insurancePay: 'Оплачивает поставщик',
        terminalPay: 'Оплачивает поставщик',
        customsPay: 'Покупатель (растаможка в РФ на импортере)',
        warning: '<strong>Совет юриста по DAP:</strong> Поставщик доставляет груз до вашего склада или таможенного терминала в РФ, но импортное таможенное декларирование и уплату пошлин в бюджет РФ производит покупатель.',
        clause: 'DAP Buyer Warehouse, Moscow, Russia, Incoterms 2020',
        steps: [
          { name: '1. Производство и экспортная затаможка в КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '2. Международная доставка до территории РФ', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '3. Доставка на таможенный терминал / склад в РФ', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '4. Прибытие на склад покупателя в РФ', party: 'Переход рисков', type: 'risk-shift' },
          { name: '5. Таможенная очистка и НДС 20% в РФ', party: 'Покупатель (Импортер)', type: 'buyer' },
          { name: '6. Выгрузка товара на складе покупателя', party: 'Покупатель (Импортер)', type: 'buyer' }
        ]
      },
      DDP: {
        badge: 'DDP Высокий риск серого импорта',
        badgeClass: 'red',
        transport: 'Любой вид транспорта',
        riskPoint: 'Склад покупателя в РФ с оплаченными пошлинами',
        riskSub: 'фабрика обязана оплатить пошлины и НДС в РФ',
        exportPay: 'Оплачивает поставщик',
        freightPay: 'Оплачивает поставщик',
        insurancePay: 'Оплачивает поставщик',
        terminalPay: 'Оплачивает поставщик',
        customsPay: 'Оплачивает поставщик (нерезидент РФ)',
        warning: '<strong>Внимание к DDP:</strong> По ст. 83 ТК ЕАЭС иностранная компания не может быть декларантом на таможне РФ. Часто под видом DDP китайцы предлагают серую контрабанду (карго) без ГТД и без закрывающих документов.',
        clause: 'DDP Buyer Warehouse, Moscow, Russia, Incoterms 2020',
        steps: [
          { name: '1. Производство и экспортное оформление в КНР', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '2. Международная перевозка в РФ', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '3. Импортная таможенная очистка и пошлины в РФ', party: 'Продавец (Фабрика)', type: 'seller' },
          { name: '4. Доставка на склад покупателя в РФ', party: 'Переход рисков', type: 'risk-shift' },
          { name: '5. Выгрузка на складе получателя', party: 'Покупатель (Импортер)', type: 'buyer' }
        ]
      }
    };

    // Расчет статуса валютного контроля банка (181-И)
    function calcCurrencyControl() {
      const valInput = parseFloat(document.getElementById('inco-contract-val').value) || 0;
      const curr = document.getElementById('inco-contract-curr').value;

      let rubVal = 0;
      let rate = 1;
      if (curr === 'CNY') {
        rate = liveRates.cny;
        rubVal = valInput * rate;
      } else if (curr === 'USD') {
        rate = liveRates.usd;
        rubVal = valInput * rate;
      } else if (curr === 'EUR') {
        rate = liveRates.eur;
        rubVal = valInput * rate;
      } else {
        rate = 1;
        rubVal = valInput;
      }

      // Обновляем подсказку в поле ввода
      const subEl = document.getElementById('inco-val-rub-sub');
      if (subEl) {
        subEl.innerText = '~' + Math.round(rubVal).toLocaleString() + ' ₽ по курсу ЦБ РФ' + (curr !== 'RUB' ? ' (' + rate.toFixed(2) + ' ₽)' : '');
      }

      // Пороги валютного контроля ЦБ РФ
      const thresholdRub = 3000000;
      const thresholdCny = Math.round(thresholdRub / liveRates.cny);
      const thresholdUsd = Math.round(thresholdRub / liveRates.usd);
      const thresholdEur = Math.round(thresholdRub / liveRates.eur);

      // Обновляем статус-бар в шапке вкладки
      const cnyBarEl = document.getElementById('inco-threshold-cny');
      const usdBarEl = document.getElementById('inco-threshold-usd');
      const eurBarEl = document.getElementById('inco-threshold-eur');
      const dateBarEl = document.getElementById('inco-rates-date');
      const dotBarEl = document.getElementById('inco-rates-dot');

      if (cnyBarEl) cnyBarEl.innerText = thresholdCny.toLocaleString() + ' ¥';
      if (usdBarEl) usdBarEl.innerText = '$' + thresholdUsd.toLocaleString();
      if (eurBarEl) eurBarEl.innerText = '€' + thresholdEur.toLocaleString();
      if (dateBarEl) dateBarEl.innerText = liveRates.isLive ? 'онлайн на ' + liveRates.dateStr : 'на ' + liveRates.dateStr;
      if (dotBarEl) dotBarEl.style.background = liveRates.isLive ? '#10b981' : '#f59e0b';

      // Оценка необходимости УНК
      const badgeEl = document.getElementById('inco-vc-badge');
      const descEl = document.getElementById('inco-vc-desc');
      const resValRubEl = document.getElementById('res-inco-val-rub');
      const resBankRuleEl = document.getElementById('res-inco-bank-rule');

      if (resValRubEl) resValRubEl.innerText = Math.round(rubVal).toLocaleString() + ' ₽';

      if (rubVal >= thresholdRub) {
        if (badgeEl) {
          badgeEl.className = 'badge-risk-pill orange';
          badgeEl.innerText = 'УНК требуется (от 3 млн ₽)';
        }
        if (descEl) {
          descEl.innerHTML = 'Сумма контракта <strong>' + Math.round(rubVal).toLocaleString() + ' ₽</strong> превышает порог 3 000 000 ₽. Контракт подлежит обязательной постановке на учет в уполномоченном банке РФ с присвоением Уникального номера контракта (УНК) по Инструкции ЦБ № 181-И (п. 4.1.1). Требуются точные сроки поставки и возврата аванса по ст. 19 Закона № 173-ФЗ.';
        }
        if (resBankRuleEl) {
          resBankRuleEl.innerHTML = 'Порог УНК (3 млн ₽) превышен. Контракт обязательно ставится на учет в банке. Срок возврата аванса нерезидентом в договоре: строго до 30 дней.';
        }
      } else {
        if (badgeEl) {
          badgeEl.className = 'badge-risk-pill green';
          badgeEl.innerText = 'Упрощенный учет (до 3 млн ₽)';
        }
        if (descEl) {
          descEl.innerHTML = 'Сумма контракта <strong>' + Math.round(rubVal).toLocaleString() + ' ₽</strong> менее 3 000 000 ₽. Присвоение УНК и оформление ведомости банковского контроля не требуются. Валютный контроль проводится банком в упрощенном порядке (предоставляются только контракт и инвойс при проведении платежа).';
        }
        if (resBankRuleEl) {
          resBankRuleEl.innerHTML = 'Сумма менее 3 млн ₽: УНК не требуется. Банк проверяет только контракт и инвойс без оформления паспорта сделки.';
        }
      }

      // Динамическое обновление справочника Инкотермс в реальном времени
      const kbIncoName = document.getElementById('kb-inco-name');
      const incoBasisEl = document.getElementById('incoterms-basis');
      if (kbIncoName && incoBasisEl) kbIncoName.innerText = incoBasisEl.value;
      const kbIncoBadge = document.getElementById('kb-inco-badge');
      const incoBadgeEl = document.getElementById('incoterms-badge');
      if (kbIncoBadge && incoBadgeEl) kbIncoBadge.innerText = incoBadgeEl.innerText;
      const kbIncoRisk = document.getElementById('kb-inco-risk');
      const incoRiskEl = document.getElementById('inco-transport');
      if (kbIncoRisk && incoRiskEl) kbIncoRisk.innerText = incoRiskEl.innerText;
      const kbUnkSum = document.getElementById('kb-unk-sum');
      if (kbUnkSum) kbUnkSum.innerText = Math.round(rubVal).toLocaleString() + ' ₽';
      const kbUnkStatus = document.getElementById('kb-unk-status');
      if (kbUnkStatus) kbUnkStatus.innerText = (rubVal >= thresholdRub ? 'УНК ТРЕБУЕТСЯ' : 'УПРОЩЕННЫЙ УЧЕТ');
      const kbFineRange = document.getElementById('kb-fine-range');
      if (kbFineRange) {
        const fineMin = Math.round(rubVal * 0.03);
        const fineMax = Math.round(rubVal * 0.10);
        kbFineRange.innerText = 'от ' + fineMin.toLocaleString() + ' до ' + fineMax.toLocaleString() + ' ₽';
      }

    }

    function renderIncoterms() {
      const basis = document.getElementById('incoterms-basis').value;
      const data = incoData[basis];

      const badgeEl = document.getElementById('incoterms-badge');
      badgeEl.innerText = data.badge;
      badgeEl.className = 'status-badge ' + (data.badgeClass || '');

      document.getElementById('inco-transport').innerText = data.transport;
      document.getElementById('inco-export').innerText = data.exportPay;
      document.getElementById('inco-freight').innerText = data.freightPay;
      document.getElementById('inco-insurance').innerText = data.insurancePay;
      document.getElementById('inco-terminal').innerText = data.terminalPay;
      document.getElementById('inco-customs').innerText = data.customsPay;
      document.getElementById('inco-risk-point').innerText = data.riskPoint;
      document.getElementById('inco-risk-sub').innerText = data.riskSub;
      document.getElementById('incoterms-warning').innerHTML = data.warning;
      document.getElementById('inco-clause-text').innerText = data.clause;

      const container = document.getElementById('incoterms-steps');
      container.innerHTML = '';
      data.steps.forEach(step => {
        const div = document.createElement('div');
        div.className = `matrix-step ${step.type}`;
        let badgeClass = 'badge-buyer';
        if (step.type === 'seller') badgeClass = 'badge-seller';
        else if (step.type === 'risk-shift') badgeClass = 'badge-shift';

        div.innerHTML = `
          <span>${step.name}</span>
          <span class="badge-party ${badgeClass}">${step.party}</span>
        `;
        container.appendChild(div);
      });

      calcCurrencyControl();
    }

    function copyIncoClause() {
      const clause = document.getElementById('inco-clause-text').innerText;
      copyTextToClipboard(clause, 'Оговорка Инкотермс скопирована!');
    }

    // 4. Валидатор товаросопроводительных документов (Инвойс & Пакинг)
    function validateDocs() {
      const boxes = parseInt(document.getElementById('val-boxes').value) || 1;
      const sku = parseInt(document.getElementById('val-sku').value) || 1;
      const netto = parseFloat(document.getElementById('val-netto').value) || 0;
      const brutto = parseFloat(document.getElementById('val-brutto').value) || 0;
      const amount = parseFloat(document.getElementById('val-amount').value) || 0;
      const curr = document.getElementById('val-curr').value;

      const hasPallets = document.getElementById('val-has-pallets').checked;
      const palletsRow = document.getElementById('val-pallets-row');
      let palletsCount = 0;
      let palletWeight = 20;
      let palletsTotalWeight = 0;

      if (hasPallets) {
        palletsRow.style.display = 'block';
        palletsCount = parseInt(document.getElementById('val-pallets-count').value) || 0;
        palletWeight = parseFloat(document.getElementById('val-pallet-weight').value) || 20;
        palletsTotalWeight = palletsCount * palletWeight;
      } else {
        palletsRow.style.display = 'none';
      }

      // Пересчет валюты в рубли по живому курсу ЦБ
      const rate = getCustomsExchangeRate(curr);
      const amountRub = amount * rate;
      const currSymbols = { USD: '$', CNY: '¥', EUR: '€' };
      const currSym = currSymbols[curr] || curr;

      document.getElementById('res-val-amount-curr').innerText = `${currSym}${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      document.getElementById('res-val-amount-rub').innerText = `~${Math.round(amountRub).toLocaleString('ru-RU')} ₽ (по курсу ЦБ)`;
      document.getElementById('res-val-netto-display').innerText = `${netto.toFixed(1)} кг`;

      // Расчет чистого веса тары коробок
      const totalDiff = brutto - netto;
      const boxesTare = Math.max(0, totalDiff - palletsTotalWeight);
      const boxesTarePercent = brutto > 0 ? (boxesTare / brutto) * 100 : 0;
      const avgBox = boxes > 0 ? (brutto / boxes) : 0;

      document.getElementById('res-val-boxes-tare').innerText = `${boxesTare.toFixed(1)} кг (${boxesTarePercent.toFixed(1)}%)`;
      if (hasPallets) {
        document.getElementById('res-val-pallets-weight').innerText = `${palletsTotalWeight.toFixed(1)} кг (${palletsCount} поддонов x ${palletWeight} кг)`;
      } else {
        document.getElementById('res-val-pallets-weight').innerText = 'Без поддонов';
      }
      document.getElementById('res-val-brutto-total').innerText = `${brutto.toFixed(1)} кг`;
      document.getElementById('res-val-box-avg').innerText = `${avgBox.toFixed(1)} кг`;

      // Оценка рисков СУР ФТС
      const weightItem = document.getElementById('check-weight');
      const badgeRatio = document.getElementById('badge-weight-ratio');
      const verdict = document.getElementById('res-val-verdict');
      const subVerdict = document.getElementById('res-val-sub');
      const statusBadge = document.getElementById('val-status-badge');

      if (brutto <= netto) {
        badgeRatio.innerText = 'Брутто <= Нетто (Ошибка!)';
        badgeRatio.style.color = '#dc2626';
        weightItem.className = 'validator-item warn';
        verdict.innerText = 'Критическая ошибка весов';
        verdict.style.color = '#dc2626';
        subVerdict.innerText = 'Вес брутто не может быть меньше или равен нетто. Автоматический отказ в регистрации ДТ в АИСТ-М.';
        statusBadge.innerText = 'Отказ в регистрации ДТ';
        statusBadge.style.background = '#fef2f2';
        statusBadge.style.color = '#dc2626';
      } else if (hasPallets && totalDiff < palletsTotalWeight) {
        badgeRatio.innerText = 'Вес паллет превысил тару!';
        badgeRatio.style.color = '#dc2626';
        weightItem.className = 'validator-item warn';
        verdict.innerText = 'Несоответствие веса поддонов';
        verdict.style.color = '#dc2626';
        subVerdict.innerText = 'Вес деревянных паллет больше общей разницы брутто и нетто. Проверьте вес коробок и количество поддонов.';
        statusBadge.innerText = 'Дисбаланс паллет';
        statusBadge.style.background = '#fef2f2';
        statusBadge.style.color = '#dc2626';
      } else if (boxesTarePercent < 1.5) {
        badgeRatio.innerText = `${boxesTarePercent.toFixed(1)}% (Критически мало!)`;
        badgeRatio.style.color = '#dc2626';
        weightItem.className = 'validator-item warn';
        verdict.innerText = 'Красная зона СУР (Мало тары)';
        verdict.style.color = '#dc2626';
        subVerdict.innerText = 'Вес тары менее 1.5% от брутто. Риск 100% досмотра со взвешиванием на СВХ и штрафа по ст. 16.2 КоАП РФ.';
        statusBadge.innerText = 'Красная зона СУР';
        statusBadge.style.background = '#fef2f2';
        statusBadge.style.color = '#dc2626';
      } else if (boxesTarePercent < 3.0) {
        badgeRatio.innerText = `${boxesTarePercent.toFixed(1)}% (Легкая тара)`;
        badgeRatio.style.color = '#ea580c';
        weightItem.className = 'validator-item warn';
        verdict.innerText = 'Повышенное внимание инспектора';
        verdict.style.color = '#ea580c';
        subVerdict.innerText = 'Вес тары от 1.5% до 3%. Возможен запрос пояснений от таможенного инспектора по упаковке.';
        statusBadge.innerText = 'Желтая зона риска';
        statusBadge.style.background = '#fffbeb';
        statusBadge.style.color = '#d97706';
      } else if (boxesTarePercent <= 20.0) {
        badgeRatio.innerText = `${boxesTarePercent.toFixed(1)}% (Зеленый коридор СУР)`;
        badgeRatio.style.color = '#15803d';
        weightItem.className = 'validator-item ok';
        verdict.innerText = 'Готово к декларированию';
        verdict.style.color = '#15803d';
        subVerdict.innerText = 'Соотношение брутто и нетто находится в физиологической норме гофрокартона (3-20%). Риски ст. 16.2 КоАП РФ отсутствуют.';
        statusBadge.innerText = 'Зеленый коридор СУР';
        statusBadge.style.background = '#ecfdf5';
        statusBadge.style.color = '#047857';
      } else if (boxesTarePercent <= 30.0) {
        badgeRatio.innerText = `${boxesTarePercent.toFixed(1)}% (Утяжеленная тара)`;
        badgeRatio.style.color = '#ea580c';
        weightItem.className = 'validator-item warn';
        verdict.innerText = 'Тяжелая тара (Переплата за фрахт)';
        verdict.style.color = '#ea580c';
        subVerdict.innerText = 'Вес упаковки от 20% до 30%. Проверьте необходимость жесткой обрешетки, возможна переплата за доставку воздуха.';
        statusBadge.innerText = 'Оранжевая зона';
        statusBadge.style.background = '#fff7ed';
        statusBadge.style.color = '#ea580c';
      } else {
        badgeRatio.innerText = `${boxesTarePercent.toFixed(1)}% (Аномально тяжелая!)`;
        badgeRatio.style.color = '#dc2626';
        weightItem.className = 'validator-item warn';
        verdict.innerText = 'Аномальный вес тары (>30%)';
        verdict.style.color = '#dc2626';
        subVerdict.innerText = 'Тара свыше 30% вызывает подозрение таможни на сокрытие незадекларированных товаров внутри упаковки. 100% досмотр с вскрытием.';
        statusBadge.innerText = 'Подозрение СУР';
        statusBadge.style.background = '#fef2f2';
        statusBadge.style.color = '#dc2626';
      }

      // Оценка среднего веса коробки
      const boxItem = document.getElementById('check-box-avg');
      const badgeBox = document.getElementById('badge-box-avg');
      if (avgBox > 35) {
        badgeBox.innerText = `${avgBox.toFixed(1)} кг (Тяжеловес >35 кг)`;
        badgeBox.style.color = '#ea580c';
        boxItem.className = 'validator-item warn';
      } else if (avgBox < 2 && boxes > 10) {
        badgeBox.innerText = `${avgBox.toFixed(1)} кг (Мелкие места)`;
        badgeBox.style.color = '#ea580c';
        boxItem.className = 'validator-item warn';
      } else {
        badgeBox.innerText = `${avgBox.toFixed(1)} кг (Норма)`;
        badgeBox.style.color = '#15803d';
        boxItem.className = 'validator-item ok';
      }

      // Статус поддонов в чек-листе
      const palletsItem = document.getElementById('check-pallets');
      const badgePallets = document.getElementById('badge-pallets-status');
      if (hasPallets) {
        badgePallets.innerText = `${palletsTotalWeight.toFixed(0)} кг (${palletsCount} паллет)`;
        badgePallets.style.color = '#15803d';
        palletsItem.className = 'validator-item ok';
      } else {
        badgePallets.innerText = 'Без поддонов';
        badgePallets.style.color = 'var(--text-muted)';
        palletsItem.className = 'validator-item ok';
      }

      updateShippingMarks();

      // Динамическое обновление справочника Валидатора в реальном времени
      const kbInvSum = document.getElementById('kb-inv-sum');
      if (kbInvSum) kbInvSum.innerText = `${currSym}${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const kbInvRub = document.getElementById('kb-inv-rub');
      if (kbInvRub) kbInvRub.innerText = `~${Math.round(amountRub).toLocaleString('ru-RU')} ₽`;
      const kbInvBoxes = document.getElementById('kb-inv-boxes');
      if (kbInvBoxes) kbInvBoxes.innerText = `${boxes} коробок`;
      const kbInvSku = document.getElementById('kb-inv-sku');
      if (kbInvSku) kbInvSku.innerText = `${sku} SKU`;
      const kbTareBrutto = document.getElementById('kb-tare-brutto');
      if (kbTareBrutto) kbTareBrutto.innerText = `${brutto.toFixed(1)} кг`;
      const kbTareNetto = document.getElementById('kb-tare-netto');
      if (kbTareNetto) kbTareNetto.innerText = `${netto.toFixed(1)} кг`;
      const kbTareDiff = document.getElementById('kb-tare-diff');
      if (kbTareDiff) kbTareDiff.innerText = `${boxesTare.toFixed(1)} кг (${boxesTarePercent.toFixed(1)}%)`;
      const kbTareStatus = document.getElementById('kb-tare-status');
      if (kbTareStatus) kbTareStatus.innerText = statusBadge.innerText;
      const kbSurVerdict = document.getElementById('kb-sur-verdict');
      if (kbSurVerdict) kbSurVerdict.innerText = verdict.innerText;

    }

    // Генерация Shipping Marks
    function updateShippingMarks() {
      const boxes = parseInt(document.getElementById('val-boxes').value) || 1;
      const netto = parseFloat(document.getElementById('val-netto').value) || 0;
      const brutto = parseFloat(document.getElementById('val-brutto').value) || 0;
      const consignee = document.getElementById('val-mark-consignee').value.trim() || 'LLC SMART IMPORT';
      const contract = document.getElementById('val-mark-contract').value.trim() || 'CN-RU-2026/01';
      const invoice = document.getElementById('val-mark-invoice').value.trim() || 'INV-2026/105';
      const dest = document.getElementById('val-mark-dest').value.trim() || 'MOSCOW VIA VLADIVOSTOK';

      const markText = 
`==================================================
                 SHIPPING MARKS
==================================================
CONSIGNEE:    ${consignee.toUpperCase()}
CONTRACT NO:  ${contract.toUpperCase()}
INVOICE NO:   ${invoice.toUpperCase()}
DESTINATION:  ${dest.toUpperCase()}
CARTON NO:    BOX # 01 - ${String(boxes).padStart(2, '0')} (TOTAL ${boxes} CTNS)
NET WEIGHT:   ${netto.toFixed(2)} KGS
GROSS WEIGHT: ${brutto.toFixed(2)} KGS
--------------------------------------------------
COUNTRY OF ORIGIN: MADE IN CHINA
HANDLING: FRAGILE | KEEP DRY | THIS SIDE UP
==================================================`;

      const previewEl = document.getElementById('shipping-marks-preview');
      if (previewEl) {
        previewEl.innerText = markText;
      }
    }

    function copyShippingMarks() {
      const previewEl = document.getElementById('shipping-marks-preview');
      if (previewEl) {
        copyTextToClipboard(previewEl.innerText, 'Shipping Marks успешно скопированы для фабрики');
      }
    }

    function updateInvoiceChecklist() {
      const container = document.querySelector('.checklist-grid');
      if (!container) return;
      const total = container.querySelectorAll('input[type="checkbox"]').length;
      const checked = container.querySelectorAll('input[type="checkbox"]:checked').length;
      const scoreEl = document.getElementById('invoice-checklist-score');
      if (scoreEl) {
        if (checked === total) {
          scoreEl.innerText = `Проверено: ${checked} из ${total} реквизитов • Готово к таможне`;
          scoreEl.style.background = '#ecfdf5';
          scoreEl.style.color = '#047857';
          scoreEl.style.borderColor = '#a7f3d0';
        } else {
          scoreEl.innerText = `Заполнено: ${checked} из ${total} реквизитов (внимание)`;
          scoreEl.style.background = '#fffbeb';
          scoreEl.style.color = '#d97706';
          scoreEl.style.borderColor = '#fde68a';
        }
      }
    }

    // 5. Калькулятор РОП (ФЗ № 89-ФЗ, ФЗ № 451-ФЗ, ПП РФ № 2394, ПП РФ № 741)
    function applyRopPreset(presetKey) {
      if (presetKey === 'container') {
        document.getElementById('rop-m-gofra').value = 450;
        document.getElementById('rop-m-poly').value = 40;
        document.getElementById('rop-m-wood').value = 440;
        document.getElementById('rop-pallets-count').value = 22;
        document.getElementById('rop-m-foam').value = 25;
        document.getElementById('rop-m-metal').value = 0;
        document.getElementById('rop-m-combo').value = 0;
      } else if (presetKey === 'lcl') {
        document.getElementById('rop-m-gofra').value = 80;
        document.getElementById('rop-m-poly').value = 10;
        document.getElementById('rop-m-wood').value = 0;
        document.getElementById('rop-pallets-count').value = 0;
        document.getElementById('rop-m-foam').value = 0;
        document.getElementById('rop-m-metal').value = 0;
        document.getElementById('rop-m-combo').value = 0;
      } else if (presetKey === 'clothes') {
        document.getElementById('rop-m-gofra').value = 250;
        document.getElementById('rop-m-poly').value = 60;
        document.getElementById('rop-m-wood').value = 0;
        document.getElementById('rop-pallets-count').value = 0;
        document.getElementById('rop-m-foam').value = 0;
        document.getElementById('rop-m-metal').value = 0;
        document.getElementById('rop-m-combo').value = 0;
      } else if (presetKey === 'heavy') {
        document.getElementById('rop-m-gofra').value = 0;
        document.getElementById('rop-m-poly').value = 50;
        document.getElementById('rop-m-wood').value = 800;
        document.getElementById('rop-pallets-count').value = 40;
        document.getElementById('rop-m-foam').value = 30;
        document.getElementById('rop-m-metal').value = 15;
        document.getElementById('rop-m-combo').value = 0;
      }
      updateRopPallets();
      calcROP();
      showToast('Пресет успешно применен');
    }

    function updateRopPallets() {
      const count = parseInt(document.getElementById('rop-pallets-count').value) || 0;
      const weight = count * 20;
      const textElem = document.getElementById('rop-pallets-calc-text');
      if (textElem) {
        textElem.innerText = count + ' шт x 20 кг = ' + weight + ' кг';
      }
    }

    function applyRopPalletsToWood() {
      const count = parseInt(document.getElementById('rop-pallets-count').value) || 0;
      const weight = count * 20;
      document.getElementById('rop-m-wood').value = weight;
      calcROP();
      showToast('Вес паллет (' + weight + ' кг) внесен в Группу 48');
    }

    function calcROP() {
      const yearNormElem = document.getElementById('rop-year');
      const norm = parseFloat(yearNormElem ? yearNormElem.value : 1.0) || 1.0;

      const gofraKg = parseFloat(document.getElementById('rop-m-gofra').value) || 0;
      const polyKg = parseFloat(document.getElementById('rop-m-poly').value) || 0;
      const woodKg = parseFloat(document.getElementById('rop-m-wood').value) || 0;
      const foamKg = parseFloat(document.getElementById('rop-m-foam').value) || 0;
      const metalKg = parseFloat(document.getElementById('rop-m-metal').value) || 0;
      const comboKg = parseFloat(document.getElementById('rop-m-combo').value) || 0;

      // Базовые ставки ПП РФ № 2394 и коэффициенты экологичности ПП РФ № 741
      // Гр. 44: Гофрокартон -> 2378 руб./т, Кэко=1.0 (2.378 руб./кг)
      const costGofra = (gofraKg / 1000) * 2378.0 * 1.0 * norm;
      // Гр. 46: Полимеры -> 3844 руб./т, Кэко=1.1 (4.2284 руб./кг)
      const costPoly = (polyKg / 1000) * 3844.0 * 1.1 * norm;
      // Гр. 48: Дерево -> 3066 руб./т, Кэко=1.0 (3.066 руб./кг)
      const costWood = (woodKg / 1000) * 3066.0 * 1.0 * norm;
      // Гр. 47: Пенопласт -> 3844 руб./т, Кэко=1.3 (4.9972 руб./кг)
      const costFoam = (foamKg / 1000) * 3844.0 * 1.3 * norm;
      // Гр. 49: Металл -> 2423 руб./т, Кэко=1.0 (2.423 руб./кг)
      const costMetal = (metalKg / 1000) * 2423.0 * 1.0 * norm;
      // Гр. 52: Комбинированная тара -> 3844 руб./т, Кэко=1.4 (5.3816 руб./кг)
      const costCombo = (comboKg / 1000) * 3844.0 * 1.4 * norm;

      const totalWeightKg = gofraKg + polyKg + woodKg + foamKg + metalKg + comboKg;
      const totalWeightTons = totalWeightKg / 1000;
      const totalCost = costGofra + costPoly + costWood + costFoam + costMetal + costCombo;

      // Обновление бейджа норматива
      const normBadge = document.getElementById('rop-norm-badge');
      if (normBadge) {
        if (norm === 1.0) normBadge.innerText = 'Норматив 100%';
        else if (norm === 0.75) normBadge.innerText = 'Норматив 75%';
        else normBadge.innerText = 'Норматив 55%';
      }

      // Вывод результатов
      document.getElementById('res-rop-total').innerText = Math.round(totalCost).toLocaleString('ru-RU') + ' ₽';
      document.getElementById('res-rop-compare-tax').innerText = Math.round(totalCost).toLocaleString('ru-RU') + ' ₽';
      document.getElementById('res-rop-weight-kg').innerText = totalWeightKg.toFixed(1) + ' кг (' + totalWeightTons.toFixed(3) + ' т)';

      document.getElementById('res-rop-cost-gofra').innerText = costGofra.toFixed(2) + ' ₽ (' + gofraKg + ' кг)';
      document.getElementById('res-rop-cost-poly').innerText = costPoly.toFixed(2) + ' ₽ (' + polyKg + ' кг)';
      document.getElementById('res-rop-cost-wood').innerText = costWood.toFixed(2) + ' ₽ (' + woodKg + ' кг)';
      document.getElementById('res-rop-cost-foam').innerText = costFoam.toFixed(2) + ' ₽ (' + foamKg + ' кг)';

      // Скрытие/отображение редких групп
      const lineMetal = document.getElementById('res-rop-line-metal');
      if (lineMetal) {
        lineMetal.style.display = metalKg > 0 ? 'flex' : 'none';
        document.getElementById('res-rop-cost-metal').innerText = costMetal.toFixed(2) + ' ₽ (' + metalKg + ' кг)';
      }
      const lineCombo = document.getElementById('res-rop-line-combo');
      if (lineCombo) {
        lineCombo.style.display = comboKg > 0 ? 'flex' : 'none';
        document.getElementById('res-rop-cost-combo').innerText = costCombo.toFixed(2) + ' ₽ (' + comboKg + ' кг)';
      }

      // Динамический расчет штрафа по ст. 8.41.1 КоАП РФ (3-кратный сбор, но не менее 500 000 ₽)
      const fineKoap = Math.max(500000, Math.round(totalCost * 3));
      const fineElem = document.getElementById('res-rop-fine-val');
      if (fineElem) {
        fineElem.innerText = 'от ' + fineKoap.toLocaleString('ru-RU') + ' ₽';
      }

      // Вердикт сравнения со штрафом
      const verdictElem = document.getElementById('res-rop-compare-verdict');
      if (verdictElem) {
        if (totalCost > 0) {
          const ratio = Math.max(1, Math.round(fineKoap / totalCost));
          verdictElem.innerHTML = '🛡️ <strong>Выгода уплаты сбора:</strong> легальная уплата ' + Math.round(totalCost).toLocaleString('ru-RU') + ' ₽ предотвращает штраф по КоАП ' + fineKoap.toLocaleString('ru-RU') + ' ₽ (разница в ' + ratio + ' раз).';
        } else {
          verdictElem.innerHTML = 'ℹ️ Укажите массу упаковки для сопоставления со штрафами Росприроднадзора.';
        }
      }

      // Обновление шаблона платежки
      const purposeElem = document.getElementById('rop-payment-purpose');
      if (purposeElem) {
        const yearText = norm === 1.0 ? '2026' : (norm === 0.75 ? '2025' : '2024');
        const normPct = Math.round(norm * 100);
        purposeElem.innerText = 'Экологический сбор за упаковку товаров, выпущенных в РФ в ' + yearText + ' году по ДТ, норматив ' + normPct + '%. Сумма ' + Math.round(totalCost) + ' руб. Без НДС.';
      }

      // Динамическое обновление справочника РОП в реальном времени
      const kbRopTotalMass = document.getElementById('kb-rop-total-mass');
      if (kbRopTotalMass) kbRopTotalMass.innerText = totalWeightKg.toFixed(1) + ' кг (' + totalWeightTons.toFixed(3) + ' т)';
      const kbRopNorm = document.getElementById('kb-rop-norm');
      if (kbRopNorm) kbRopNorm.innerText = Math.round(norm * 100) + '%';
      const kbRopTotalFee = document.getElementById('kb-rop-total-fee');
      if (kbRopTotalFee) kbRopTotalFee.innerText = Math.round(totalCost).toLocaleString('ru-RU') + ' ₽';
      const kbRopFeeDue = document.getElementById('kb-rop-fee-due');
      if (kbRopFeeDue) kbRopFeeDue.innerText = Math.round(totalCost).toLocaleString('ru-RU') + ' ₽';
      const kbRopFine = document.getElementById('kb-rop-fine');
      if (kbRopFine) kbRopFine.innerText = 'от ' + fineKoap.toLocaleString('ru-RU') + ' ₽';

    }

    function copyRopPayment() {
      const kbk = '048 1 12 08010 01 6000 120';
      const status = '01';
      const purpose = document.getElementById('rop-payment-purpose').innerText;
      const sum = document.getElementById('res-rop-total').innerText;

      const text = `Реквизиты платежа экологического сбора РОП (Росприроднадзор):\n` +
        `• Получатель: Территориальный орган Росприроднадзора\n` +
        `• КБК: ${kbk}\n` +
        `• Статус составителя (поле 101): ${status}\n` +
        `• Срок уплаты: до 15 апреля ежегодно\n` +
        `• Сумма к уплате: ${sum}\n` +
        `• Назначение платежа:\n${purpose}`;

      copyTextToClipboard(text, 'Реквизиты платежа скопированы для бухгалтера');
    }

    // Копирование расчетов в буфер
    function copyCalculation(type) {
      let textToCopy = '';
      if (type === 'cbm') {
        const cbm = document.getElementById('res-cbm').innerText;
        const density = document.getElementById('res-density').innerText;
        const rate = document.getElementById('res-applied-rate').innerText;
        const days = document.getElementById('res-transit-days').innerText;
        const perItemDel = document.getElementById('res-per-item').innerText;
        const perItemDelRub = document.getElementById('res-per-item-rub').innerText;
        const unitCostRub = document.getElementById('res-total-unit-cost').innerText;
        const totalDel = document.getElementById('res-total-delivery').innerText;
        const totalDelRub = document.getElementById('res-total-rub').innerText;
        const grandRub = document.getElementById('res-grand-total').innerText;
        const grandSub = document.getElementById('res-grand-total-sub').innerText;
        const freight = document.getElementById('res-freight-cost').innerText;
        const pack = document.getElementById('res-pack-cost').innerText;
        const ins = document.getElementById('res-insurance-cost').innerText;
        const term = document.getElementById('res-terminal-cost').innerText;
        const usdRate = getActiveUsdRate().toFixed(2);
        const cnyRate = getActiveCnyRate().toFixed(2);

        textToCopy = `Расчет логистики и себестоимости из Китая (chainikcheck.ru):
` +
          `• Курсы ЦБ РФ: 1 $ = ${usdRate} ₽ | 1 ¥ = ${cnyRate} ₽
` +
          `• Объем партии: ${cbm} | Плотность: ${density}
` +
          `• Способ: ${tariffMeta[currentTariff].name} (${days})
` +
          `• Тариф фрахта: ${rate}
` +
          `-----------------------------------
` +
          `• Фрахт Китай - Москва: ${freight}
` +
          `• Упаковка в Китае: ${pack}
` +
          `• Страхование партии: ${ins}
` +
          `• Терминал Москва (ТЯК): ${term}
` +
          `-----------------------------------
` +
          `• Итого доставка партии: ${totalDel} (${totalDelRub})
` +
          `• Доставка на 1 шт: ${perItemDel} (${perItemDelRub})
` +
          `• ПОЛНАЯ СЕБЕСТОИМОСТЬ 1 ШТ В РФ: ${unitCostRub} (закупка + логистика)
` +
          `• Полный бюджет партии под ключ: ${grandRub} (${grandSub})`;
      } else if (type === 'customs') {
        const currency = document.getElementById('customs-currency').value;
        const totalForeign = document.getElementById('customs-cost-preview').innerText;
        const tcRub = document.getElementById('res-tc-rub').innerText;
        const dutyRate = document.getElementById('res-duty-rate').innerText;
        const dutySum = document.getElementById('res-duty-sum').innerText;
        const ndsBase = document.getElementById('res-nds-base').innerText;
        const ndsRate = document.getElementById('res-nds-rate-label').innerText;
        const ndsSum = document.getElementById('res-nds-sum').innerText;
        const fee = document.getElementById('res-customs-fee').innerText;
        const total = document.getElementById('res-customs-total').innerText;
        const burden = document.getElementById('res-customs-burden').innerText;
        const catSelect = document.getElementById('customs-cat');
        const catName = catSelect.options[catSelect.selectedIndex].text;
        const rate = getCustomsExchangeRate(currency);

        textToCopy = `Расчет таможенных платежей в бюджет РФ (chainikcheck.ru):
` +
          `• Товар: ${catName}
` +
          `• Валюта: ${currency} (Курс ЦБ РФ: ${rate.toFixed(2)} ₽ на ${liveRates.dateStr})
` +
          `• Таможенная стоимость (ТС): ${totalForeign}
` +
          `--------------------------------------------------
` +
          `1. Ввозная таможенная пошлина (${dutyRate}): ${dutySum}
` +
          `2. Налоговая база НДС (ТС + Пошлина): ${ndsBase}
` +
          `3. Таможенный НДС (${ndsRate}): ${ndsSum}
` +
          `4. Таможенный сбор (ПП РФ № 342): ${fee}
` +
          `--------------------------------------------------
` +
          `• ИТОГО К ПЕРЕЧИСЛЕНИЮ НА ЕЛС ФТС: ${total}
` +
          `• Фискальная нагрузка на партию: ${burden}`;
      } else if (type === 'incoterms') {
        const basis = document.getElementById('incoterms-basis').value;
        const data = incoData[basis];
        const valInput = document.getElementById('inco-contract-val').value;
        const curr = document.getElementById('inco-contract-curr').value;
        const rubVal = document.getElementById('res-inco-val-rub').innerText;
        const vcStatus = document.getElementById('inco-vc-badge').innerText;
        const clause = document.getElementById('inco-clause-text').innerText;

        textToCopy = `Юридический аудит контракта ВЭД и рисков Инкотермс-2020 (chainikcheck.ru):
` +
          `• Базис поставки: ${basis} - ${data.badge}
` +
          `• Вид транспорта: ${data.transport}
` +
          `• Точка перехода рисков: ${data.riskPoint}
` +
          `--------------------------------------------------
` +
          `РАСПРЕДЕЛЕНИЕ ЗОН РАСХОДОВ И ОТВЕТСТВЕННОСТИ:
` +
          `• Экспортное оформление в КНР: ${data.exportPay}
` +
          `• Международный фрахт Китай - РФ: ${data.freightPay}
` +
          `• Страхование груза: ${data.insurancePay}
` +
          `• Терминальные сборы в РФ (THC): ${data.terminalPay}
` +
          `• Таможенная очистка и НДС в РФ: ${data.customsPay}
` +
          `--------------------------------------------------
` +
          `ВАЛЮТНЫЙ КОНТРОЛЬ ЦБ РФ (ИНСТРУКЦИЯ № 181-И):
` +
          `• Сумма контракта: ${valInput} ${curr} (~${rubVal})
` +
          `• Статус учета: ${vcStatus}
` +
          `• Нормативный порог постановки на учет (УНК): 3 000 000 ₽
` +
          `• Требование ст. 19 Закона № 173-ФЗ: обязательный срок возврата аванса до 30 дней
` +
          `--------------------------------------------------
` +
          `ЭТАЛОННАЯ ОГОВОРКА ДЛЯ КОНТРАКТА:
` +
          `${clause}`;
      } else if (type === 'validator') {
        const boxes = document.getElementById('val-boxes').value;
        const sku = document.getElementById('val-sku').value;
        const amountCurr = document.getElementById('res-val-amount-curr').innerText;
        const amountRub = document.getElementById('res-val-amount-rub').innerText;
        const netto = document.getElementById('res-val-netto-display').innerText;
        const boxesTare = document.getElementById('res-val-boxes-tare').innerText;
        const palletsWeight = document.getElementById('res-val-pallets-weight').innerText;
        const bruttoTotal = document.getElementById('res-val-brutto-total').innerText;
        const boxAvg = document.getElementById('res-val-box-avg').innerText;
        const verdict = document.getElementById('res-val-verdict').innerText;
        const subVerdict = document.getElementById('res-val-sub').innerText;
        const statusBadge = document.getElementById('val-status-badge').innerText;
        const marks = document.getElementById('shipping-marks-preview').innerText;

        textToCopy = `Аудит товаросопроводительных документов (chainikcheck.ru):\n` +
          `• Партия: ${boxes} коробок, ${sku} артикулов (SKU)\n` +
          `• Сумма инвойса: ${amountCurr} (${amountRub})\n` +
          `--------------------------------------------------\n` +
          `ВЕСОВОЙ БАЛАНС И СУР ФТС РФ:\n` +
          `• Вес Нетто товара (чистый): ${netto}\n` +
          `• Вес чистой тары коробок: ${boxesTare}\n` +
          `• Вес деревянных паллет: ${palletsWeight}\n` +
          `• Итоговый вес Брутто (Графа 35 ДТ): ${bruttoTotal}\n` +
          `• Средний вес одного места: ${boxAvg}\n` +
          `--------------------------------------------------\n` +
          `СТАТУС И ТАМОЖЕННЫЕ РИСКИ:\n` +
          `• Профиль СУР: ${statusBadge}\n` +
          `• Вердикт: ${verdict}\n` +
          `• Оценка: ${subVerdict}\n` +
          `--------------------------------------------------\n` +
          `МАРКИРОВКА ГРУЗОВЫХ МЕСТ (SHIPPING MARKS):\n` +
          `${marks}`;
      } else if (type === 'rop') {
        const total = document.getElementById('res-rop-total').innerText;
        const weight = document.getElementById('res-rop-weight-kg').innerText;
        const normBadge = document.getElementById('rop-norm-badge').innerText;
        const gofra = document.getElementById('res-rop-cost-gofra').innerText;
        const poly = document.getElementById('res-rop-cost-poly').innerText;
        const wood = document.getElementById('res-rop-cost-wood').innerText;
        const foam = document.getElementById('res-rop-cost-foam').innerText;
        const purpose = document.getElementById('rop-payment-purpose').innerText;

        textToCopy = `Расчет экологического сбора РОП на упаковку импорта (chainikcheck.ru):\n` +
          `• Нормативная база: ФЗ № 89-ФЗ, ФЗ № 451-ФЗ, ПП РФ № 2394, ПП РФ № 741\n` +
          `• Норматив утилизации: ${normBadge}\n` +
          `• Общая масса упаковки партии: ${weight}\n` +
          `--------------------------------------------------\n` +
          `РАСЧЕТ ПО ТОВАРНЫМ ГРУППАМ:\n` +
          `• Гофрокартон (Гр. 44, 2.38 ₽/кг): ${gofra}\n` +
          `• Полимерная пленка (Гр. 46, 4.23 ₽/кг): ${poly}\n` +
          `• Деревянные паллеты (Гр. 48, 3.07 ₽/кг): ${wood}\n` +
          `• Пенопласт ложементы (Гр. 47, 5.00 ₽/кг): ${foam}\n` +
          `--------------------------------------------------\n` +
          `• СУММА ЭКОСБОРА К УПЛАТЕ: ${total}\n` +
          `--------------------------------------------------\n` +
          `РЕКВИЗИТЫ ПЛАТЕЖА В РОСПРИРОДНАДЗОР:\n` +
          `• КБК: 048 1 12 08010 01 6000 120 (Статус 01)\n` +
          `• Срок уплаты: ежегодно до 15 апреля\n` +
          `• Назначение платежа: ${purpose}\n` +
          `--------------------------------------------------\n` +
          `ОТВЕТСТВЕННОСТЬ ПО КОАП РФ:\n` +
          `• Ст. 8.41.1 КоАП РФ (неуплата): 3-кратный штраф от 500 000 ₽\n` +
          `• Ст. 8.5.1 ч. 1 КоАП РФ (несдача отчета): штраф до 150 000 ₽\n` +
          `• Ст. 8.5.1 ч. 2 КоАП РФ (нулевка при импорте): штраф от 250 000 ₽`;
      }

      copyTextToClipboard(textToCopy, 'Расчет успешно скопирован в буфер');
    }

    function copyTextToClipboard(val, successMsg) {
      const msg = successMsg || 'Скопировано в буфер';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(() => {
          showToast(msg);
        }).catch(() => {
          fallbackCopyText(val, msg);
        });
      } else {
        fallbackCopyText(val, msg);
      }
    }

    function fallbackCopyText(val, msg) {
      const toastMsg = msg || 'Скопировано в буфер';
      const ta = document.createElement('textarea');
      ta.value = val;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        showToast(toastMsg);
      } catch (err) {
        showToast(toastMsg);
      }
      document.body.removeChild(ta);
    }

    function showToast(msg) {
      const toast = document.getElementById('toast-copy');
      toast.innerHTML = '<span>✓</span> ' + msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }

    // ========================================================
    // ЮРИДИЧЕСКИЕ ТЕКСТЫ И МОДАЛЬНЫЕ ОКНА
    // ========================================================
    const legalDocs = {
      privacy: {
        title: "Политика конфиденциальности и обработки данных (152-ФЗ)",
        content: `
          <h4>1. Общие положения и оператор ресурса</h4>
          <p>Настоящая Политика конфиденциальности действует в отношении всей информации, размещенной на веб-сайте <strong>chainikcheck.ru</strong> (далее - Сервис). Использование Сервиса означает безоговорочное согласие пользователя с настоящей Политикой.</p>

          <h4>2. Принцип локальной обработки данных (Zero Data Collection)</h4>
          <p>Сервис ChainikCheck разработан по принципу максимальной конфиденциальности коммерческой информации:</p>
          <ul>
            <li>Сервис <strong>не требует регистрации</strong>, ввода имени, фамилии, адреса электронной почты или номера телефона для использования калькуляторов.</li>
            <li>Все математические вычисления (габариты коробок, объемы CBM, вес, стоимость партий, пошлины) производятся <strong>исключительно на устройстве пользователя в его веб-браузере</strong> посредством выполнения локальных JavaScript-скриптов.</li>
            <li>Никакие коммерческие параметры ваших партий товаров, инвойсов или закупочных цен <strong>не отправляются на сервер, не сохраняются в базах данных и не передаются третьим лицам</strong>.</li>
          </ul>

          <h4>3. Персональные данные (Федеральный закон № 152-ФЗ)</h4>
          <p>Администрация Сервиса не осуществляет целенаправленный сбор, хранение, систематизацию или передачу персональных данных граждан РФ. В случае добровольного обращения пользователя по адресу электронной почты правовой поддержки, предоставленные сведения используются исключительно для ответа на обращение и не распространяются.</p>

          <h4>4. Использование систем веб-аналитики (Яндекс Метрика и Google Search Console)</h4>
          <p>Для оценки технической стабильности, учета посещаемости и оптимизации интерфейса калькулятора на Сервисе используются (или планируются к подключению) официальные системы веб-аналитики:</p>
          <ul>
            <li><strong>Яндекс Метрика (ООО «ЯНДЕКС»)</strong>: счетчик аналитики фиксирует обезличенные данные о переходах, посещенных страницах, типах устройств, разрешении экрана и технических сбоях. Применяется для оптимизации скорости работы сайта.</li>
            <li><strong>Google Search Console / Google Analytics (Google LLC)</strong>: инструменты поискового аудита и мониторинга индексации сайта в глобальной поисковой системе Google.</li>
          </ul>
          <p><strong>Обезличенный характер аналитики:</strong> Данные системы не собирают персональные данные физических лиц, не считывают вводимые пользователем коммерческие параметры грузов, объемы коробок или стоимость товаров. Данные передаются в обезличенном виде.</p>
          <p><strong>Право на блокировку аналитики:</strong> Пользователь имеет право заблокировать сбор статистики Яндекс.Метрики с помощью официального расширения «Блокировщик Яндекс.Метрики» либо путем отключения аналитических cookie в браузере.</p>

          <h4>5. Технические логи и кибербезопасность</h4>
          <p>Сервер может временно обрабатывать обезличенные технические параметры соединения (IP-адрес, тип браузера, время запроса) исключительно в целях обеспечения безопасности и защиты от DDoS-атак. Данные логи перезаписываются и не связываются с личностью пользователя.</p>

          <h4>6. Контакты и обратная связь</h4>
          <p>По любым вопросам, касающимся работы сервиса, предложений и соблюдения законодательства о данных, обращения принимаются через личные сообщения официального подтвержденного профиля на платформе Kwork: <strong>kwork.ru/user/milligat</strong> (кнопка «Связаться с продавцом»).</p>
        `
      },
      terms: {
        title: "Пользовательское соглашение и условия использования",
        content: `
          <h4>1. Предмет соглашения</h4>
          <p>Настоящее Соглашение определяет условия и порядок использования бесплатного информационно-аналитического ресурса <strong>chainikcheck.ru</strong>. Начиная использование любого калькулятора или информационного блока Сервиса, пользователь подтверждает полное ознакомление и согласие с настоящими условиями.</p>

          <h4>2. Статус сервиса и отсутствие публичной оферты</h4>
          <p>Сервис ChainikCheck является независимым математическим и аналитическим калькулятором. В соответствии с <strong>пунктом 2 статьи 437 Гражданского кодекса РФ</strong>, ни один материал, ставка, цифра или расчет, представленный на сайте, <strong>не является публичной офертой</strong>.</p>

          <h4>3. Права и обязанности пользователя</h4>
          <ul>
            <li>Пользователь имеет право свободно и безвозмездно использовать функционал калькуляторов для собственных предварительных расчетов.</li>
            <li>Пользователь обязуется не использовать автоматизированные скрипты для генерации паразитной нагрузки на сервер (DDoS-атаки, чрезмерный скрапинг).</li>
            <li>Пользователь понимает, что коммерческие условия договоров с реальными логистическими компаниями, экспедиторами, таможенными брокерами и банками определяются индивидуальными договорами между пользователем и соответствующими юридическими лицами.</li>
          </ul>

          <h4>4. Интеллектуальная собственность</h4>
          <p>Все элементы графического оформления, уникальный векторный персонаж Си Ши (Маскот Weave), тексты справочника, структура калькуляторов и программный код являются объектами интеллектуальной собственности администрации ресурса и защищены законодательством РФ об авторском праве.</p>
        `
      },
      disclaimer: {
        title: "Отказ от ответственности (Дисклеймер)",
        content: `
          <h4>1. Справочный и предварительный характер расчетов</h4>
          <p>Все результаты вычислений CBM, плотности груза карго, ставок доставки, таможенных пошлин, сборов ФТС, НДС 20% и сумм экологического сбора РОП на сайте chainikcheck.ru являются <strong>ориентировочными и предварительными математическими моделями</strong>.</p>

          <h4>2. Ограничение ответственности по решениям государственных органов</h4>
          <p>Администрация сайта chainikcheck.ru не несет ответственности за:</p>
          <ul>
            <li>Решения инспекторов таможенных постов Федеральной таможенной службы РФ (ФТС РФ) по переквалификации кодов ТН ВЭД, корректировке таможенной стоимости (КТС), назначению таможенных досмотров и экспертиз;</li>
            <li>Административные штрафы по статьям 16.2, 16.3 КоАП РФ, начисленные за недостоверное декларирование пользователем или его таможенным брокером;</li>
            <li>Решения территориальных управлений Росприроднадзора по суммам экологического сбора РОП и штрафам по статьям 8.5.1, 8.41.1 КоАП РФ;</li>
            <li>Требования органов валютного контроля уполномоченных банков РФ при постановке контрактов ВЭД на учет (Инструкция ЦБ № 181-И).</li>
          </ul>

          <h4>3. Ограничение ответственности по тарифам третьих лиц</h4>
          <p>Рыночные ставки карго-перевозчиков, экспедиторских линий, авиакомпаний, железнодорожных операторов, терминалов Южные Ворота, ТЯК Москва и портов Владивостока/СПб могут динамически изменяться в зависимости от курса доллара/юаня, сезона, очередей на границе и габаритов конкретных коробок. Администрация ресурса не гарантирует неизменность сторонних тарифов.</p>

          <h4>4. Ответственность пользователя</h4>
          <p>Пользователь принимает на себя полную ответственность за проверку всех данных перед подписанием коммерческих контрактов и подачей деклараций на товары (ДТ). Администрация Сервиса не возмещает прямые или косвенные убытки, упущенную выгоду или расходы, возникшие в связи с использованием расчетов.</p>
        `
      },
      cookies: {
        title: "Правила использования файлов Cookie",
        content: `
          <h4>1. Что такое файлы Cookie</h4>
          <p>Файлы cookie (куки) - это небольшие текстовые фрагменты данных, сохраняемые браузером на вашем компьютере или мобильном устройстве при посещении сайтов.</p>

          <h4>2. Какие cookie используются на ChainikCheck</h4>
          <p>Наш сайт использует исключительно <strong>технические и сессионные файлы cookie</strong>, необходимые для:</p>
          <ul>
            <li>Запоминания факта вашего ознакомления с предупреждением о cookie;</li>
            <li>Сохранения выбранных вкладок интерфейса в рамках одной сессии;</li>
            <li>Обеспечения базовой киберзащиты от автоматического спама.</li>
          </ul>

          <h4>3. Аналитические файлы Cookie (Яндекс Метрика и Google)</h4>
          <p>На сайте используются (или планируются к использованию) аналитические файлы cookie сервисов Яндекс.Метрика и Google Search Console. Они позволяют собирать обобщенную статистику о популярности вкладок калькулятора и устранять технические ошибки. Эти файлы cookie не идентифицируют личность пользователя и обрабатываются в анонимном виде.</p>

          <h4>4. Отсутствие рекламного трекинга</h4>
          <p>Мы <strong>не используем</strong> сторонние рекламные ретаргетинговые пиксели и скрипты межсайтового поведенческого профилирования пользователей.</p>

          <h4>4. Управление файлами cookie</h4>
          <p>Вы можете в любой момент отключить или очистить файлы cookie в настройках вашего браузера (Microsoft Edge, Chrome, Safari, Firefox). Отключение cookie не повлияет на возможность проведения расчетов в калькуляторе.</p>
        `
      },
      "kwork-rules": {
        title: "Регламент экспертных услуг на Kwork.ru",
        content: `
          <h4>1. Независимый статус эксперта</h4>
          <p>Ссылки на индивидуальные услуги аудита, проверку инвойсов, подбор кодов ТН ВЭД и контрактов ВЭД ведут на официальный подтвержденный профиль эксперта на бирже фриланса <strong>Kwork.ru</strong> (пользователь milligat).</p>

          <h4>2. Безопасная сделка и гарантии Kwork</h4>
          <ul>
            <li>Все финансовые расчеты за индивидуальные экспертные консультации проводятся строго через официальную систему <strong>Безопасной сделки Kwork.ru</strong>.</li>
            <li>Сайт chainikcheck.ru <strong>не принимает платежи</strong>, не хранит данные банковских карт и не выставляет прямых счетов.</li>
            <li>Оплата резервируется платформой Kwork и перечисляется исполнителю только после того, как заказчик лично проверит и примет выполненную работу.</li>
            <li>В случае любого несоответствия заказу регламент Kwork гарантирует 100% возврат денежных средств заказчику через арбитраж биржи.</li>
          </ul>

          <h4>3. Конфиденциальность коммерческих документов</h4>
          <p>Все черновики инвойсов, упаковочных листов и контрактов, передаваемые в рамках заказов на Kwork, защищены правилами платформы о неразглашении конфиденциальной информации третьим лицам.</p>
        `
      }
    };

    function openModal(docKey) {
      const doc = legalDocs[docKey];
      if (!doc) return;

      document.getElementById('modal-title-text').innerHTML = '<span>📄</span> ' + doc.title;
      document.getElementById('modal-body-content').innerHTML = doc.content;

      const overlay = document.getElementById('legal-modal-overlay');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      const overlay = document.getElementById('legal-modal-overlay');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    function closeModalOnBackdrop(e) {
      if (e.target.id === 'legal-modal-overlay') {
        closeModal();
      }
    }

    // Закрытие модального окна по Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    });

    // Управление cookie-баннером
    function acceptCookies() {
      localStorage.setItem('chainik_cookies_accepted', 'true');
      const banner = document.getElementById('cookie-banner');
      if (banner) banner.classList.remove('visible');
    }

    function checkCookieConsent() {
      if (!localStorage.getItem('chainik_cookies_accepted')) {
        setTimeout(() => {
          const banner = document.getElementById('cookie-banner');
          if (banner) banner.classList.add('visible');
        }, 1200);
      }
    }

    // Инициализация при загрузке страницы
    // Инициализация при загрузке страницы (безопасно для каждой отдельной страницы)
    window.addEventListener('DOMContentLoaded', () => {
      fetchLiveCurrencyRates();
      if (document.getElementById('cargo-weight') || document.getElementById('box-l')) {
        calcCBM();
      }
      if (document.getElementById('customs-cat')) {
        calcCustoms();
      }
      if (document.getElementById('inco-contract-val') || document.getElementById('incoterms-basis')) {
        calcCurrencyControl();
        renderIncoterms();
      }
      if (document.getElementById('val-boxes') || document.getElementById('val-gross-weight')) {
        validateDocs();
      }
      if (document.getElementById('rop-m-gofra')) {
        calcROP();
      }
      checkCookieConsent();
    });
  
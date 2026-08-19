/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 01_db_core_01.txt

 役割：
 - 共通名前空間 MS の作成
 - 基本設定
 - IndexedDB 初期化
 - ObjectStore 作成
 - DB共通関数の土台

 結合順：
 01_db_core_01.txt
 01_db_core_02.txt
 01_db_core_03.txt
 02_project_01.txt
 02_project_02.txt
 02_project_03.txt
 03_estimate_01.txt
 03_estimate_02.txt
 04_price.txt
 05_ui_01.txt
 05_ui_02.txt
 06_utils.txt
 07_export.txt
============================================================
*/

(function(window, document){
  "use strict";

  if(window.MS && window.MS.__initialized){
    console.warn("MS common library is already initialized.");
    return;
  }

  const MS = window.MS || {};

  MS.__initialized = true;

  MS.VERSION = "1.2.8";
  MS.RELEASE_VERSION = "1.6.0";
  MS.RELEASE_NAME = "積算テンプレート統合版";

  MS.CONFIG = {
    dbName: "MS_SEKISAN_SYSTEM_DB",
    dbVersion: 3,

    stores: {
      projects: "projects",
      estimates: "estimates",
      settings: "settings",
      prices: "prices",
      logs: "logs",
      productMasters: "productMasters",
      estimateMasters: "estimateMasters"
    },

    currentProjectKey: "ms_current_project_id",
    currentEstimateKeyPrefix: "ms_current_estimate_id_",

    appTypes: {
      L: "l_wall",
      U: "u_gutter",
      GENBAU_U: "genbau_u_gutter",
      PRECAST_L: "precast_l_wall",
      GENBAU_DRAINAGE_PIT: "genbau_drainage_pit",
      CURB: "curb",
      PEDESTRIAN_VEHICLE_BLOCK: "pedestrian_vehicle_boundary_block",
      L_GUTTER: "l_gutter",
      MIKIRI_CONCRETE: "mikiri_concrete",
      GRAVITY_WALL: "gravity_wall",
      KAHEN_SOKKOU: "kahen_sokkou",
      ANKYO_CULVERT: "ankyo_culvert",
      DRAINAGE_PIPE: "drainage_pipe",
      PRECAST_DRAINAGE_BASIN: "precast_drainage_basin",
      KENCHI_BLOCK: "kenchi_block",
      FIRE_TANK: "fire_tank"
    }
  };


  /*
============================================================
 [STANDARD] 積算テンプレート
 新規標準では製品情報・寸法・単価・施工条件をここへ統合します。
============================================================
*/
/*
   * Ver.1.2.6 マスター標準方針
   * - 新しい標準：MS.EstimateMaster（積算テンプレート）に一本化
   * - MS.ProductMaster は未移行アプリ専用の互換層
   * - index・U型側溝・可変側溝など移行済み画面からは参照しない
   * - 全アプリ移行完了後に、この互換層と productMasters ストアだけを削除する
   */
  MS.MASTER_POLICY = {
    primary: "estimateMasters",
    primaryLabel: "積算テンプレート",
    legacyProductMaster: true,
    legacyProductMasterReadWrite: true /* 未移行アプリ専用。新規標準からは使用しない */,
    migrationPhase: "v1.6.0_rollout"
  };

  MS.isLegacyProductMasterMode = function(){
    return !!(MS.MASTER_POLICY && MS.MASTER_POLICY.legacyProductMaster);
  };

  MS._state = {
    db: null,
    dbOpening: null,
    ready: false,
    lastError: null
  };

  MS.Error = class MSError extends Error {
    constructor(message, detail){
      super(message);
      this.name = "MSError";
      this.detail = detail || null;
      this.createdAt = new Date().toISOString();
    }
  };

  MS.DB = {};

  MS.DB.open = function(){
    if(MS._state.db){
      return Promise.resolve(MS._state.db);
    }

    if(MS._state.dbOpening){
      return MS._state.dbOpening;
    }

    MS._state.dbOpening = new Promise(function(resolve, reject){
      if(!window.indexedDB){
        const err = new MS.Error("このブラウザは IndexedDB に対応していません。");
        MS._state.lastError = err;
        reject(err);
        return;
      }

      const request = window.indexedDB.open(
        MS.CONFIG.dbName,
        MS.CONFIG.dbVersion
      );

      request.onupgradeneeded = function(event){
        const db = event.target.result;

        MS.DB._createStores(db);
      };

      request.onsuccess = function(event){
        const db = event.target.result;

        db.onversionchange = function(){
          db.close();
          alert("データベースが更新されました。画面を再読み込みしてください。");
        };

        MS._state.db = db;
        MS._state.ready = true;

        resolve(db);
      };

      request.onerror = function(event){
        const err = new MS.Error(
          "データベースを開けませんでした。",
          event.target.error
        );
        MS._state.lastError = err;
        reject(err);
      };

      request.onblocked = function(){
        const err = new MS.Error(
          "データベースの更新がブロックされました。他の画面を閉じてから再読み込みしてください。"
        );
        MS._state.lastError = err;
        reject(err);
      };
    });

    return MS._state.dbOpening;
  };

  MS.DB._createStores = function(db){
    const stores = MS.CONFIG.stores;

    if(!db.objectStoreNames.contains(stores.projects)){
      const projectStore = db.createObjectStore(stores.projects, {
        keyPath: "id"
      });

      projectStore.createIndex("name", "name", { unique: false });
      projectStore.createIndex("updatedAt", "updatedAt", { unique: false });
      projectStore.createIndex("createdAt", "createdAt", { unique: false });
    }

    if(!db.objectStoreNames.contains(stores.estimates)){
      const estimateStore = db.createObjectStore(stores.estimates, {
        keyPath: "id"
      });

      estimateStore.createIndex("projectId", "projectId", { unique: false });
      estimateStore.createIndex("appType", "appType", { unique: false });
      estimateStore.createIndex("project_app", ["projectId", "appType"], { unique: false });
      estimateStore.createIndex("name", "name", { unique: false });
      estimateStore.createIndex("updatedAt", "updatedAt", { unique: false });
      estimateStore.createIndex("createdAt", "createdAt", { unique: false });
    }

    if(!db.objectStoreNames.contains(stores.settings)){
      db.createObjectStore(stores.settings, {
        keyPath: "key"
      });
    }

    if(!db.objectStoreNames.contains(stores.prices)){
      const priceStore = db.createObjectStore(stores.prices, {
        keyPath: "id"
      });

      priceStore.createIndex("type", "type", { unique: false });
      priceStore.createIndex("projectId", "projectId", { unique: false });
      priceStore.createIndex("updatedAt", "updatedAt", { unique: false });
    }

    if(stores.productMasters && !db.objectStoreNames.contains(stores.productMasters)){
      const productStore = db.createObjectStore(stores.productMasters, {
        keyPath: "id"
      });

      productStore.createIndex("category", "category", { unique: false });
      productStore.createIndex("manufacturer", "manufacturer", { unique: false });
      productStore.createIndex("productName", "productName", { unique: false });
      productStore.createIndex("category_manufacturer", ["category", "manufacturer"], { unique: false });
      productStore.createIndex("updatedAt", "updatedAt", { unique: false });
      productStore.createIndex("createdAt", "createdAt", { unique: false });
    }

    if(stores.estimateMasters && !db.objectStoreNames.contains(stores.estimateMasters)){
      const estimateMasterStore = db.createObjectStore(stores.estimateMasters, {
        keyPath: "id"
      });
      estimateMasterStore.createIndex("appType", "appType", { unique: false });
      estimateMasterStore.createIndex("name", "name", { unique: false });
      estimateMasterStore.createIndex("updatedAt", "updatedAt", { unique: false });
      estimateMasterStore.createIndex("createdAt", "createdAt", { unique: false });
    }

    if(!db.objectStoreNames.contains(stores.logs)){
      const logStore = db.createObjectStore(stores.logs, {
        keyPath: "id"
      });

      logStore.createIndex("type", "type", { unique: false });
      logStore.createIndex("createdAt", "createdAt", { unique: false });
    }
  };

  MS.DB.close = function(){
    if(MS._state.db){
      MS._state.db.close();
      MS._state.db = null;
      MS._state.dbOpening = null;
      MS._state.ready = false;
    }
  };

  MS.DB.isReady = function(){
    return !!MS._state.ready;
  };

  window.MS = MS;

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 01_db_core_02.txt

 役割：
 - DBトランザクション共通処理
 - put / get / getAll / delete / clear
 - index検索
 - 件数取得
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("01_db_core_01.txt が先に読み込まれていません。");
  }

  MS.DB.transaction = async function(storeName, mode){
    const db = await MS.DB.open();

    try{
      const tx = db.transaction(storeName, mode || "readonly");
      const store = tx.objectStore(storeName);
      return { db, tx, store };
    }catch(error){
      throw new MS.Error(
        "トランザクションを作成できませんでした。",
        { storeName, mode, error }
      );
    }
  };

  MS.DB.put = async function(storeName, value){
    const ctx = await MS.DB.transaction(storeName, "readwrite");

    return new Promise(function(resolve, reject){
      const request = ctx.store.put(value);

      request.onsuccess = function(){
        resolve(value);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "データの保存に失敗しました。",
          { storeName, value, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.add = async function(storeName, value){
    const ctx = await MS.DB.transaction(storeName, "readwrite");

    return new Promise(function(resolve, reject){
      const request = ctx.store.add(value);

      request.onsuccess = function(){
        resolve(value);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "データの追加に失敗しました。",
          { storeName, value, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.get = async function(storeName, key){
    const ctx = await MS.DB.transaction(storeName, "readonly");

    return new Promise(function(resolve, reject){
      const request = ctx.store.get(key);

      request.onsuccess = function(){
        resolve(request.result || null);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "データの読込に失敗しました。",
          { storeName, key, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.getAll = async function(storeName){
    const ctx = await MS.DB.transaction(storeName, "readonly");

    return new Promise(function(resolve, reject){
      const request = ctx.store.getAll();

      request.onsuccess = function(){
        resolve(request.result || []);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "一覧の読込に失敗しました。",
          { storeName, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.delete = async function(storeName, key){
    const ctx = await MS.DB.transaction(storeName, "readwrite");

    return new Promise(function(resolve, reject){
      const request = ctx.store.delete(key);

      request.onsuccess = function(){
        resolve(true);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "データの削除に失敗しました。",
          { storeName, key, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.clear = async function(storeName){
    const ctx = await MS.DB.transaction(storeName, "readwrite");

    return new Promise(function(resolve, reject){
      const request = ctx.store.clear();

      request.onsuccess = function(){
        resolve(true);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "データの全削除に失敗しました。",
          { storeName, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.count = async function(storeName){
    const ctx = await MS.DB.transaction(storeName, "readonly");

    return new Promise(function(resolve, reject){
      const request = ctx.store.count();

      request.onsuccess = function(){
        resolve(request.result || 0);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "件数取得に失敗しました。",
          { storeName, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.getByIndex = async function(storeName, indexName, value){
    const ctx = await MS.DB.transaction(storeName, "readonly");

    return new Promise(function(resolve, reject){
      let index;

      try{
        index = ctx.store.index(indexName);
      }catch(error){
        reject(new MS.Error(
          "インデックスが見つかりません。",
          { storeName, indexName, error }
        ));
        return;
      }

      const request = index.get(value);

      request.onsuccess = function(){
        resolve(request.result || null);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "インデックス検索に失敗しました。",
          { storeName, indexName, value, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.getAllByIndex = async function(storeName, indexName, value){
    const ctx = await MS.DB.transaction(storeName, "readonly");

    return new Promise(function(resolve, reject){
      let index;

      try{
        index = ctx.store.index(indexName);
      }catch(error){
        reject(new MS.Error(
          "インデックスが見つかりません。",
          { storeName, indexName, error }
        ));
        return;
      }

      const request = index.getAll(value);

      request.onsuccess = function(){
        resolve(request.result || []);
      };

      request.onerror = function(event){
        reject(new MS.Error(
          "インデックス一覧検索に失敗しました。",
          { storeName, indexName, value, error:event.target.error }
        ));
      };
    });
  };

  MS.DB.deleteMany = async function(storeName, keys){
    if(!Array.isArray(keys)){
      throw new MS.Error("deleteMany の keys は配列で指定してください。");
    }

    const ctx = await MS.DB.transaction(storeName, "readwrite");

    return new Promise(function(resolve, reject){
      let completed = 0;

      if(keys.length === 0){
        resolve(true);
        return;
      }

      keys.forEach(function(key){
        const request = ctx.store.delete(key);

        request.onsuccess = function(){
          completed++;
          if(completed === keys.length){
            resolve(true);
          }
        };

        request.onerror = function(event){
          reject(new MS.Error(
            "複数データの削除に失敗しました。",
            { storeName, key, error:event.target.error }
          ));
        };
      });
    });
  };

  MS.DB.putMany = async function(storeName, values){
    if(!Array.isArray(values)){
      throw new MS.Error("putMany の values は配列で指定してください。");
    }

    const ctx = await MS.DB.transaction(storeName, "readwrite");

    return new Promise(function(resolve, reject){
      let completed = 0;

      if(values.length === 0){
        resolve([]);
        return;
      }

      values.forEach(function(value){
        const request = ctx.store.put(value);

        request.onsuccess = function(){
          completed++;
          if(completed === values.length){
            resolve(values);
          }
        };

        request.onerror = function(event){
          reject(new MS.Error(
            "複数データの保存に失敗しました。",
            { storeName, value, error:event.target.error }
          ));
        };
      });
    });
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 01_db_core_03a.txt

 役割：
 - ID生成
 - 日時生成
 - localStorage補助
 - 現在の工事ID管理
 - 現在の積算ID管理
 - DB初期化
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("01_db_core_01.txt が先に読み込まれていません。");
  }

  /*
  ------------------------------------------------------------
   ID生成
  ------------------------------------------------------------
  */

  MS.createId = function(prefix){
    const p = prefix || "id";
    const time = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    return p + "_" + time + "_" + rand;
  };

  MS.now = function(){
    return new Date().toISOString();
  };

  MS.today = function(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  };

  MS.timestamp = function(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return y + m + day + "_" + h + min + s;
  };

  /*
  ------------------------------------------------------------
   localStorage補助
  ------------------------------------------------------------
  */

  MS.Storage = {};

  MS.Storage.set = function(key, value){
    try{
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch(error){
      console.warn("localStorage 保存失敗:", key, error);
      return false;
    }
  };

  MS.Storage.get = function(key, fallback){
    try{
      const raw = window.localStorage.getItem(key);

      if(raw === null || raw === undefined){
        return fallback;
      }

      return JSON.parse(raw);
    }catch(error){
      console.warn("localStorage 読込失敗:", key, error);
      return fallback;
    }
  };

  MS.Storage.remove = function(key){
    try{
      window.localStorage.removeItem(key);
      return true;
    }catch(error){
      console.warn("localStorage 削除失敗:", key, error);
      return false;
    }
  };

  MS.Storage.setText = function(key, value){
    try{
      window.localStorage.setItem(key, String(value));
      return true;
    }catch(error){
      console.warn("localStorage 保存失敗:", key, error);
      return false;
    }
  };

  MS.Storage.getText = function(key, fallback){
    try{
      const value = window.localStorage.getItem(key);
      return value === null || value === undefined ? fallback : value;
    }catch(error){
      console.warn("localStorage 読込失敗:", key, error);
      return fallback;
    }
  };

  /*
  ------------------------------------------------------------
   現在の工事ID
  ------------------------------------------------------------
  */

  MS.setCurrentProjectId = function(projectId){
    if(!projectId){
      MS.Storage.remove(MS.CONFIG.currentProjectKey);
      return null;
    }

    MS.Storage.setText(MS.CONFIG.currentProjectKey, projectId);
    return projectId;
  };

  MS.getCurrentProjectId = function(){
    return MS.Storage.getText(MS.CONFIG.currentProjectKey, "");
  };

  MS.clearCurrentProjectId = function(){
    MS.Storage.remove(MS.CONFIG.currentProjectKey);
  };

  /*
  ------------------------------------------------------------
   現在の積算ID
  ------------------------------------------------------------
  */

  MS.getCurrentEstimateKey = function(appType){
    return MS.CONFIG.currentEstimateKeyPrefix + String(appType || "default");
  };

  MS.setCurrentEstimateId = function(appType, estimateId){
    const key = MS.getCurrentEstimateKey(appType);

    if(!estimateId){
      MS.Storage.remove(key);
      return null;
    }

    MS.Storage.setText(key, estimateId);
    return estimateId;
  };

  MS.getCurrentEstimateId = function(appType){
    const key = MS.getCurrentEstimateKey(appType);
    return MS.Storage.getText(key, "");
  };

  MS.clearCurrentEstimateId = function(appType){
    const key = MS.getCurrentEstimateKey(appType);
    MS.Storage.remove(key);
  };

  /*
  ------------------------------------------------------------
   DB初期化
  ------------------------------------------------------------
  */

  MS.init = async function(){
    await MS.DB.open();

    if(MS.Price && typeof MS.Price.ensureDefaultPrices === "function"){
      await MS.Price.ensureDefaultPrices();
    }

    return true;
  };

  /*
  ------------------------------------------------------------
   DB状態取得
  ------------------------------------------------------------
  */

  MS.getStatus = function(){
    return {
      version: MS.VERSION,
      dbName: MS.CONFIG.dbName,
      dbVersion: MS.CONFIG.dbVersion,
      ready: MS.DB.isReady(),
      currentProjectId: MS.getCurrentProjectId(),
      lastError: MS._state.lastError
    };
  };

  /*
  ------------------------------------------------------------
   ログ保存
  ------------------------------------------------------------
  */

  MS.log = async function(type, message, detail){
    const log = {
      id: MS.createId("log"),
      type: type || "info",
      message: message || "",
      detail: detail || null,
      createdAt: MS.now()
    };

    try{
      await MS.DB.put(MS.CONFIG.stores.logs, log);
    }catch(error){
      console.warn("ログ保存失敗:", error);
    }

    return log;
  };

  MS.getLogs = async function(){
    const logs = await MS.DB.getAll(MS.CONFIG.stores.logs);

    return logs.sort(function(a, b){
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  };

  MS.clearLogs = async function(){
    return MS.DB.clear(MS.CONFIG.stores.logs);
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 01_db_core_03b.txt

 役割：
 - 文字列・数値の基本チェック
 - 安全なオブジェクトコピー
 - DB接続確認
 - 基本データ整形
 - DB Core 完成部分
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("01_db_core_01.txt が先に読み込まれていません。");
  }

  /*
  ------------------------------------------------------------
   基本判定
  ------------------------------------------------------------
  */

  MS.isObject = function(value){
    return value !== null && typeof value === "object" && !Array.isArray(value);
  };

  MS.isString = function(value){
    return typeof value === "string";
  };

  MS.isNumber = function(value){
    return typeof value === "number" && !isNaN(value) && isFinite(value);
  };

  MS.isEmpty = function(value){
    if(value === null || value === undefined){
      return true;
    }

    if(typeof value === "string" && value.trim() === ""){
      return true;
    }

    if(Array.isArray(value) && value.length === 0){
      return true;
    }

    if(MS.isObject(value) && Object.keys(value).length === 0){
      return true;
    }

    return false;
  };

  /*
  ------------------------------------------------------------
   安全な変換
  ------------------------------------------------------------
  */

  MS.toNumber = function(value, fallback){
    const n = Number(value);

    if(isNaN(n) || !isFinite(n)){
      return fallback !== undefined ? fallback : 0;
    }

    return n;
  };

  MS.toText = function(value, fallback){
    if(value === null || value === undefined){
      return fallback !== undefined ? fallback : "";
    }

    return String(value);
  };

  MS.trim = function(value){
    return MS.toText(value).trim();
  };

  MS.toArray = function(value){
    if(Array.isArray(value)){
      return value;
    }

    if(value === null || value === undefined){
      return [];
    }

    return [value];
  };

  /*
  ------------------------------------------------------------
   オブジェクト操作
  ------------------------------------------------------------
  */

  MS.clone = function(value){
    if(value === null || value === undefined){
      return value;
    }

    try{
      return JSON.parse(JSON.stringify(value));
    }catch(error){
      console.warn("clone失敗:", error);
      return value;
    }
  };

  MS.merge = function(){
    const result = {};

    for(let i = 0; i < arguments.length; i++){
      const source = arguments[i];

      if(!MS.isObject(source)){
        continue;
      }

      Object.keys(source).forEach(function(key){
        result[key] = source[key];
      });
    }

    return result;
  };

  MS.pick = function(obj, keys){
    const result = {};

    if(!MS.isObject(obj)){
      return result;
    }

    MS.toArray(keys).forEach(function(key){
      if(Object.prototype.hasOwnProperty.call(obj, key)){
        result[key] = obj[key];
      }
    });

    return result;
  };

  MS.omit = function(obj, keys){
    const result = {};

    if(!MS.isObject(obj)){
      return result;
    }

    const omitKeys = MS.toArray(keys);

    Object.keys(obj).forEach(function(key){
      if(!omitKeys.includes(key)){
        result[key] = obj[key];
      }
    });

    return result;
  };

  /*
  ------------------------------------------------------------
   文字検索
  ------------------------------------------------------------
  */

  MS.includesText = function(text, keyword){
    const t = MS.toText(text).toLowerCase();
    const k = MS.toText(keyword).toLowerCase();

    if(k === ""){
      return true;
    }

    return t.indexOf(k) !== -1;
  };

  MS.matchAny = function(obj, keyword, fields){
    if(!keyword){
      return true;
    }

    if(!MS.isObject(obj)){
      return false;
    }

    const targetFields = MS.toArray(fields);

    for(let i = 0; i < targetFields.length; i++){
      const field = targetFields[i];

      if(MS.includesText(obj[field], keyword)){
        return true;
      }
    }

    return false;
  };

  /*
  ------------------------------------------------------------
   ソート補助
  ------------------------------------------------------------
  */

  MS.sortByUpdatedDesc = function(list){
    return MS.toArray(list).slice().sort(function(a, b){
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  };

  MS.sortByCreatedDesc = function(list){
    return MS.toArray(list).slice().sort(function(a, b){
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  };

  MS.sortByNameAsc = function(list){
    return MS.toArray(list).slice().sort(function(a, b){
      return String(a.name || "").localeCompare(String(b.name || ""), "ja");
    });
  };

  /*
  ------------------------------------------------------------
   DB接続確認
  ------------------------------------------------------------
  */

  MS.DB.ping = async function(){
    try{
      await MS.DB.open();
      return true;
    }catch(error){
      MS._state.lastError = error;
      return false;
    }
  };

  MS.DB.exists = async function(storeName, key){
    const data = await MS.DB.get(storeName, key);
    return !!data;
  };

  /*
  ------------------------------------------------------------
   保存前共通フィールド
  ------------------------------------------------------------
  */

  MS.withCreateFields = function(data, prefix){
    const now = MS.now();

    const base = MS.isObject(data) ? MS.clone(data) : {};

    if(!base.id){
      base.id = MS.createId(prefix || "item");
    }

    if(!base.createdAt){
      base.createdAt = now;
    }

    base.updatedAt = now;

    return base;
  };

  MS.withUpdateFields = function(data){
    const base = MS.isObject(data) ? MS.clone(data) : {};

    if(!base.id){
      base.id = MS.createId("item");
    }

    if(!base.createdAt){
      base.createdAt = MS.now();
    }

    base.updatedAt = MS.now();

    return base;
  };

  /*
  ------------------------------------------------------------
   一括初期化
  ------------------------------------------------------------
  */

  MS.resetDatabase = async function(){
    const stores = MS.CONFIG.stores;

    await MS.DB.clear(stores.projects);
    await MS.DB.clear(stores.estimates);
    await MS.DB.clear(stores.settings);
    await MS.DB.clear(stores.prices);
    await MS.DB.clear(stores.logs);

    MS.clearCurrentProjectId();

    await MS.log("system", "データベースを初期化しました。");

    return true;
  };

  /*
  ------------------------------------------------------------
   DB Core 完成確認
  ------------------------------------------------------------
  */

  MS.DB.coreReady = function(){
    return {
      dbCore01: true,
      dbCore02: true,
      dbCore03a: true,
      dbCore03b: true,
      version: MS.VERSION,
      dbName: MS.CONFIG.dbName,
      dbVersion: MS.CONFIG.dbVersion
    };
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 02_project_01.txt

 役割：
 - Project名前空間
 - 工事データの標準形
 - 新規工事作成
 - 工事保存
 - 現在工事の取得
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("01_db_core が先に読み込まれていません。");
  }

  MS.Project = {};

  MS.Project.createBlank = function(data){
    const now = MS.now();
    const base = MS.isObject(data) ? MS.clone(data) : {};

    return {
      id: base.id || MS.createId("project"),
      name: MS.trim(base.name || "未名称工事"),
      projectNo: MS.trim(base.projectNo || ""),
      client: MS.trim(base.client || ""),
      site: MS.trim(base.site || ""),
      address: MS.trim(base.address || ""),
      manager: MS.trim(base.manager || ""),
      memo: MS.trim(base.memo || ""),
      status: base.status || "active",
      favorite: !!base.favorite,
      profitRate: Math.max(0, Math.min(99.9, MS.toNumber(
        base.profitRate !== undefined ? base.profitRate :
        (base.marginRate !== undefined ? base.marginRate : base.profitPercent),
        20
      ))),
      prices: MS.isObject(base.prices) ? base.prices : {},
      createdAt: base.createdAt || now,
      updatedAt: now
    };
  };

  MS.Project.create = async function(data){
    const project = MS.Project.createBlank(data);

    await MS.DB.put(MS.CONFIG.stores.projects, project);
    MS.setCurrentProjectId(project.id);

    await MS.log("project", "工事を作成しました。", {
      projectId: project.id,
      name: project.name
    });

    return project;
  };

  MS.Project.save = async function(project){
    if(!MS.isObject(project)){
      throw new MS.Error("保存する工事データが正しくありません。");
    }

    const saved = MS.Project.createBlank(project);
    saved.id = project.id || saved.id;
    saved.createdAt = project.createdAt || saved.createdAt;
    saved.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, saved);
    MS.setCurrentProjectId(saved.id);

    await MS.log("project", "工事を保存しました。", {
      projectId: saved.id,
      name: saved.name
    });

    return saved;
  };

  MS.Project.get = async function(projectId){
    if(!projectId){
      return null;
    }

    return MS.DB.get(MS.CONFIG.stores.projects, projectId);
  };

  MS.Project.getCurrent = async function(){
    const projectId = MS.getCurrentProjectId();

    if(!projectId){
      return null;
    }

    return MS.Project.get(projectId);
  };

  MS.Project.setCurrent = async function(projectId){
    const project = await MS.Project.get(projectId);

    if(!project){
      throw new MS.Error("指定された工事が見つかりません。", {
        projectId: projectId
      });
    }

    MS.setCurrentProjectId(project.id);

    project.updatedAt = MS.now();
    await MS.DB.put(MS.CONFIG.stores.projects, project);

    return project;
  };

  MS.Project.ensureCurrent = async function(){
    let project = await MS.Project.getCurrent();

    if(project){
      return project;
    }

    project = await MS.Project.create({
      name: "未名称工事"
    });

    return project;
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 02_project_02.txt

 役割：
 - 工事一覧
 - 工事検索
 - お気に入り
 - 最近更新順
 - 工事名重複チェック
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS || !MS.Project){
    throw new Error("02_project_01.txt が先に読み込まれていません。");
  }

  MS.Project.list = async function(){
    const projects = await MS.DB.getAll(MS.CONFIG.stores.projects);
    return MS.sortByUpdatedDesc(projects);
  };

  MS.Project.listActive = async function(){
    const projects = await MS.Project.list();

    return projects.filter(function(project){
      return project.status !== "deleted";
    });
  };

  MS.Project.listDeleted = async function(){
    const projects = await MS.Project.list();

    return projects.filter(function(project){
      return project.status === "deleted";
    });
  };

  MS.Project.listFavorites = async function(){
    const projects = await MS.Project.listActive();

    return projects.filter(function(project){
      return !!project.favorite;
    });
  };

  MS.Project.search = async function(keyword){
    const projects = await MS.Project.listActive();
    const word = MS.trim(keyword);

    if(!word){
      return projects;
    }

    return projects.filter(function(project){
      return MS.matchAny(project, word, [
        "name",
        "projectNo",
        "client",
        "site",
        "address",
        "manager",
        "memo"
      ]);
    });
  };

  MS.Project.existsName = async function(name, ignoreProjectId){
    const projects = await MS.Project.listActive();
    const target = MS.trim(name);

    if(!target){
      return false;
    }

    return projects.some(function(project){
      if(ignoreProjectId && project.id === ignoreProjectId){
        return false;
      }

      return MS.trim(project.name) === target;
    });
  };

  MS.Project.makeUniqueName = async function(name, ignoreProjectId){
    const baseName = MS.trim(name || "未名称工事");

    const exists = await MS.Project.existsName(baseName, ignoreProjectId);

    if(!exists){
      return baseName;
    }

    let index = 2;

    while(true){
      const candidate = baseName + " (" + index + ")";
      const hit = await MS.Project.existsName(candidate, ignoreProjectId);

      if(!hit){
        return candidate;
      }

      index++;
    }
  };

  MS.Project.toggleFavorite = async function(projectId){
    const project = await MS.Project.get(projectId);

    if(!project){
      throw new MS.Error("お気に入りを変更する工事が見つかりません。", {
        projectId: projectId
      });
    }

    project.favorite = !project.favorite;
    project.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, project);

    return project;
  };

  MS.Project.setFavorite = async function(projectId, favorite){
    const project = await MS.Project.get(projectId);

    if(!project){
      throw new MS.Error("お気に入りを変更する工事が見つかりません。", {
        projectId: projectId
      });
    }

    project.favorite = !!favorite;
    project.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, project);

    return project;
  };

  MS.Project.touch = async function(projectId){
    const project = await MS.Project.get(projectId);

    if(!project){
      return null;
    }

    project.updatedAt = MS.now();
    await MS.DB.put(MS.CONFIG.stores.projects, project);

    return project;
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 02_project_03.txt

 役割：
 - 工事削除
 - 工事復元
 - 工事複製
 - 工事内積算の連動処理
 - 工事管理完成部分
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS || !MS.Project){
    throw new Error("02_project_01.txt が先に読み込まれていません。");
  }

  MS.Project.delete = async function(projectId, options){
    const opt = MS.isObject(options) ? options : {};
    const project = await MS.Project.get(projectId);

    if(!project){
      return false;
    }

    if(opt.physical === true){
      const estimates = await MS.DB.getAllByIndex(
        MS.CONFIG.stores.estimates,
        "projectId",
        projectId
      );

      const estimateIds = estimates.map(function(estimate){
        return estimate.id;
      });

      await MS.DB.deleteMany(MS.CONFIG.stores.estimates, estimateIds);
      await MS.DB.delete(MS.CONFIG.stores.projects, projectId);

      if(MS.getCurrentProjectId() === projectId){
        MS.clearCurrentProjectId();
      }

      await MS.log("project", "工事を完全削除しました。", {
        projectId: projectId,
        name: project.name
      });

      return true;
    }

    project.status = "deleted";
    project.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, project);

    if(MS.getCurrentProjectId() === projectId){
      MS.clearCurrentProjectId();
    }

    await MS.log("project", "工事を削除しました。", {
      projectId: projectId,
      name: project.name
    });

    return true;
  };

  MS.Project.restore = async function(projectId){
    const project = await MS.Project.get(projectId);

    if(!project){
      throw new MS.Error("復元する工事が見つかりません。", {
        projectId: projectId
      });
    }

    project.status = "active";
    project.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, project);

    await MS.log("project", "工事を復元しました。", {
      projectId: project.id,
      name: project.name
    });

    return project;
  };

  MS.Project.duplicate = async function(projectId){
    const source = await MS.Project.get(projectId);

    if(!source){
      throw new MS.Error("複製元の工事が見つかりません。", {
        projectId: projectId
      });
    }

    const newName = await MS.Project.makeUniqueName(source.name + " コピー");

    const copiedProject = MS.Project.createBlank(
      MS.merge(source, {
        id: MS.createId("project"),
        name: newName,
        status: "active",
        favorite: false,
        createdAt: MS.now(),
        updatedAt: MS.now()
      })
    );

    await MS.DB.put(MS.CONFIG.stores.projects, copiedProject);

    const estimates = await MS.DB.getAllByIndex(
      MS.CONFIG.stores.estimates,
      "projectId",
      projectId
    );

    const copiedEstimates = estimates.map(function(estimate){
      const copy = MS.clone(estimate);
      copy.id = MS.createId("estimate");
      copy.projectId = copiedProject.id;
      copy.name = estimate.name + " コピー";
      copy.createdAt = MS.now();
      copy.updatedAt = MS.now();
      return copy;
    });

    await MS.DB.putMany(MS.CONFIG.stores.estimates, copiedEstimates);

    MS.setCurrentProjectId(copiedProject.id);

    await MS.log("project", "工事を複製しました。", {
      sourceProjectId: projectId,
      newProjectId: copiedProject.id,
      name: copiedProject.name,
      estimateCount: copiedEstimates.length
    });

    return copiedProject;
  };

  MS.Project.rename = async function(projectId, newName){
    const project = await MS.Project.get(projectId);

    if(!project){
      throw new MS.Error("名称変更する工事が見つかりません。", {
        projectId: projectId
      });
    }

    const name = await MS.Project.makeUniqueName(newName, projectId);

    project.name = name;
    project.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, project);

    return project;
  };

  MS.Project.updatePrices = async function(projectId, prices){
    const project = await MS.Project.get(projectId);

    if(!project){
      throw new MS.Error("単価を更新する工事が見つかりません。", {
        projectId: projectId
      });
    }

    project.prices = MS.merge(project.prices || {}, prices || {});
    project.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, project);

    return project;
  };

  /*
  ------------------------------------------------------------
   工事別利益率
  ------------------------------------------------------------
  */

  MS.Project.getProfitRate = async function(projectId, fallback){
    const project = projectId
      ? await MS.Project.get(projectId)
      : await MS.Project.getCurrent();

    const defaultValue = fallback !== undefined ? MS.toNumber(fallback, 20) : 20;

    if(!project){
      return defaultValue;
    }

    const value = project.profitRate !== undefined
      ? project.profitRate
      : (project.marginRate !== undefined ? project.marginRate : project.profitPercent);

    return Math.max(0, Math.min(99.9, MS.toNumber(value, defaultValue)));
  };

  MS.Project.saveProfitRate = async function(profitRate, projectId){
    let project = projectId
      ? await MS.Project.get(projectId)
      : await MS.Project.ensureCurrent();

    if(!project){
      project = await MS.Project.create({ name: "未名称工事" });
    }

    project.profitRate = Math.max(0, Math.min(99.9, MS.toNumber(profitRate, 20)));
    project.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, project);
    MS.setCurrentProjectId(project.id);

    await MS.log("project", "工事の利益率を保存しました。", {
      projectId: project.id,
      profitRate: project.profitRate
    });

    return project.profitRate;
  };

  MS.Project.applyProfitRateToInput = async function(inputId, projectId, fallback){
    const value = await MS.Project.getProfitRate(projectId, fallback);
    const el = document.getElementById(inputId || "ProfitRate");

    if(el){
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return value;
  };

  MS.Project.getSummary = async function(projectId){
    const project = await MS.Project.get(projectId);

    if(!project){
      return null;
    }

    const estimates = await MS.DB.getAllByIndex(
      MS.CONFIG.stores.estimates,
      "projectId",
      projectId
    );

    const byApp = {};

    estimates.forEach(function(estimate){
      const appType = estimate.appType || "unknown";

      if(!byApp[appType]){
        byApp[appType] = {
          appType: appType,
          count: 0,
          amount: 0
        };
      }

      byApp[appType].count++;
      byApp[appType].amount += MS.toNumber(estimate.amount, 0);
    });

    return {
      project: project,
      estimateCount: estimates.length,
      totalAmount: estimates.reduce(function(sum, estimate){
        return sum + MS.toNumber(estimate.amount, 0);
      }, 0),
      byApp: byApp,
      updatedAt: project.updatedAt
    };
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 03_estimate_01.txt

 役割：
 - Estimate名前空間
 - 積算データの標準形
 - 積算保存
 - 積算読込
 - 現在積算の取得
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("01_db_core が先に読み込まれていません。");
  }

  MS.Estimate = {};

  /*
  ------------------------------------------------------------
   アプリ種別名
  ------------------------------------------------------------
  */

  MS.Estimate.APP_LABELS = {
    gravity_wall: "重力式擁壁",
    mikiri_concrete: "見切コンクリート",
    l_wall: "L型擁壁",
    u_gutter: "U型側溝",
    genbau_u_gutter: "現場打U型側溝",
    curb: "縁石工",
    pedestrian_vehicle_boundary_block: "歩車道ブロック工",
    kahen_sokkou: "可変側溝",
    precast_l_wall: "プレキャストL型擁壁",
    genbau_drainage_pit: "現場打排水桝",
    ankyo_culvert: "暗渠・カルバート工",
    drainage_pipe: "排水管工",
    precast_drainage_basin: "プレキャスト集水桝",
    kenchi_block: "間知ブロック積み",
    fire_tank: "防火水槽工",
    l_gutter: "L型側溝工",
    curb: "縁石工",
    pedestrian_vehicle_boundary_block: "歩車道ブロック工",
    block: "ブロック積",
    doma: "土間コンクリート",
    fence: "フェンス",
    carport: "カーポート",
    masu: "集水桝",
    other: "その他"
  };

  MS.Estimate.getAppLabel = function(appType){
    return MS.Estimate.APP_LABELS[appType] || appType || "未分類";
  };

  /*
  ------------------------------------------------------------
   標準形
  ------------------------------------------------------------
  */

  MS.Estimate.createBlank = function(appType, data){
    const now = MS.now();
    const base = MS.isObject(data) ? MS.clone(data) : {};

    return {
      id: base.id || MS.createId("estimate"),
      projectId: base.projectId || MS.getCurrentProjectId() || "",
      appType: appType || base.appType || "other",
      name: MS.trim(base.name || "未名称積算"),
      memo: MS.trim(base.memo || ""),
      data: MS.isObject(base.data) ? base.data : {},
      amount: MS.toNumber(base.amount, 0),
      quantities: MS.isObject(base.quantities) ? base.quantities : {},
      prices: MS.isObject(base.prices) ? base.prices : {},
      printData: MS.isObject(base.printData) ? base.printData : {},
      createdAt: base.createdAt || now,
      updatedAt: now
    };
  };

  /*
  ------------------------------------------------------------
   保存
  ------------------------------------------------------------
  */

  MS.Estimate.save = async function(appType, estimateData){
    const currentProject = await MS.Project.ensureCurrent();

    const estimate = MS.Estimate.createBlank(appType, estimateData);

    estimate.projectId = estimate.projectId || currentProject.id;

    if(!estimate.projectId){
      estimate.projectId = currentProject.id;
    }

    estimate.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.estimates, estimate);

    MS.setCurrentProjectId(estimate.projectId);
    MS.setCurrentEstimateId(estimate.appType, estimate.id);

    await MS.Project.touch(estimate.projectId);

    await MS.log("estimate", "積算を保存しました。", {
      estimateId: estimate.id,
      projectId: estimate.projectId,
      appType: estimate.appType,
      name: estimate.name
    });

    return estimate;
  };

  /*
  ------------------------------------------------------------
   読込
  ------------------------------------------------------------
  */

  MS.Estimate.get = async function(estimateId){
    if(!estimateId){
      return null;
    }

    return MS.DB.get(MS.CONFIG.stores.estimates, estimateId);
  };

  MS.Estimate.load = async function(estimateId){
    const estimate = await MS.Estimate.get(estimateId);

    if(!estimate){
      throw new MS.Error("積算データが見つかりません。", {
        estimateId: estimateId
      });
    }

    MS.setCurrentProjectId(estimate.projectId);
    MS.setCurrentEstimateId(estimate.appType, estimate.id);

    await MS.Project.touch(estimate.projectId);

    return estimate;
  };

  /*
  ------------------------------------------------------------
   現在積算
  ------------------------------------------------------------
  */

  MS.Estimate.getCurrent = async function(appType){
    const estimateId = MS.getCurrentEstimateId(appType);

    if(!estimateId){
      return null;
    }

    return MS.Estimate.get(estimateId);
  };

  MS.Estimate.clearCurrent = function(appType){
    MS.clearCurrentEstimateId(appType);
  };

  /*
  ------------------------------------------------------------
   新規積算開始
  ------------------------------------------------------------
  */

  MS.Estimate.startNew = async function(appType, name){
    const project = await MS.Project.ensureCurrent();

    const estimate = MS.Estimate.createBlank(appType, {
      projectId: project.id,
      name: name || "新規積算"
    });

    MS.setCurrentEstimateId(appType, "");

    return estimate;
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 03_estimate_02.txt

 役割：
 - 積算一覧
 - 工事別積算一覧
 - アプリ別積算一覧
 - 積算削除
 - 積算複製
 - 積算名称変更
 - 積算管理完成部分
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS || !MS.Estimate){
    throw new Error("03_estimate_01.txt が先に読み込まれていません。");
  }

  /*
  ------------------------------------------------------------
   一覧
  ------------------------------------------------------------
  */

  MS.Estimate.list = async function(){
    const estimates = await MS.DB.getAll(MS.CONFIG.stores.estimates);
    return MS.sortByUpdatedDesc(estimates);
  };

  MS.Estimate.listByProject = async function(projectId){
    const targetProjectId = projectId || MS.getCurrentProjectId();

    if(!targetProjectId){
      return [];
    }

    const estimates = await MS.DB.getAllByIndex(
      MS.CONFIG.stores.estimates,
      "projectId",
      targetProjectId
    );

    return MS.sortByUpdatedDesc(estimates);
  };

  MS.Estimate.listByApp = async function(appType){
    if(!appType){
      return [];
    }

    const estimates = await MS.DB.getAllByIndex(
      MS.CONFIG.stores.estimates,
      "appType",
      appType
    );

    return MS.sortByUpdatedDesc(estimates);
  };

  MS.Estimate.listByProjectAndApp = async function(projectId, appType){
    const targetProjectId = projectId || MS.getCurrentProjectId();

    if(!targetProjectId || !appType){
      return [];
    }

    const estimates = await MS.DB.getAllByIndex(
      MS.CONFIG.stores.estimates,
      "project_app",
      [targetProjectId, appType]
    );

    return MS.sortByUpdatedDesc(estimates);
  };

  /*
  ------------------------------------------------------------
   検索
  ------------------------------------------------------------
  */

  MS.Estimate.search = async function(keyword, options){
    const opt = MS.isObject(options) ? options : {};
    const word = MS.trim(keyword);

    let estimates = [];

    if(opt.projectId && opt.appType){
      estimates = await MS.Estimate.listByProjectAndApp(opt.projectId, opt.appType);
    }else if(opt.projectId){
      estimates = await MS.Estimate.listByProject(opt.projectId);
    }else if(opt.appType){
      estimates = await MS.Estimate.listByApp(opt.appType);
    }else{
      estimates = await MS.Estimate.list();
    }

    if(!word){
      return estimates;
    }

    return estimates.filter(function(estimate){
      return MS.matchAny(estimate, word, [
        "name",
        "memo",
        "appType"
      ]);
    });
  };

  /*
  ------------------------------------------------------------
   削除
  ------------------------------------------------------------
  */

  MS.Estimate.delete = async function(estimateId){
    const estimate = await MS.Estimate.get(estimateId);

    if(!estimate){
      return false;
    }

    await MS.DB.delete(MS.CONFIG.stores.estimates, estimateId);

    if(MS.getCurrentEstimateId(estimate.appType) === estimateId){
      MS.clearCurrentEstimateId(estimate.appType);
    }

    await MS.Project.touch(estimate.projectId);

    await MS.log("estimate", "積算を削除しました。", {
      estimateId: estimateId,
      projectId: estimate.projectId,
      appType: estimate.appType,
      name: estimate.name
    });

    return true;
  };

  /*
  ------------------------------------------------------------
   複製
  ------------------------------------------------------------
  */

  MS.Estimate.duplicate = async function(estimateId){
    const source = await MS.Estimate.get(estimateId);

    if(!source){
      throw new MS.Error("複製元の積算が見つかりません。", {
        estimateId: estimateId
      });
    }

    const copy = MS.clone(source);

    copy.id = MS.createId("estimate");
    copy.name = source.name + " コピー";
    copy.createdAt = MS.now();
    copy.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.estimates, copy);

    MS.setCurrentProjectId(copy.projectId);
    MS.setCurrentEstimateId(copy.appType, copy.id);

    await MS.Project.touch(copy.projectId);

    await MS.log("estimate", "積算を複製しました。", {
      sourceEstimateId: estimateId,
      newEstimateId: copy.id,
      projectId: copy.projectId,
      appType: copy.appType,
      name: copy.name
    });

    return copy;
  };

  /*
  ------------------------------------------------------------
   名称変更
  ------------------------------------------------------------
  */

  MS.Estimate.rename = async function(estimateId, newName){
    const estimate = await MS.Estimate.get(estimateId);

    if(!estimate){
      throw new MS.Error("名称変更する積算が見つかりません。", {
        estimateId: estimateId
      });
    }

    estimate.name = MS.trim(newName || estimate.name || "未名称積算");
    estimate.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.estimates, estimate);

    await MS.Project.touch(estimate.projectId);

    return estimate;
  };

  /*
  ------------------------------------------------------------
   メモ更新
  ------------------------------------------------------------
  */

  MS.Estimate.updateMemo = async function(estimateId, memo){
    const estimate = await MS.Estimate.get(estimateId);

    if(!estimate){
      throw new MS.Error("メモを更新する積算が見つかりません。", {
        estimateId: estimateId
      });
    }

    estimate.memo = MS.trim(memo || "");
    estimate.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.estimates, estimate);

    await MS.Project.touch(estimate.projectId);

    return estimate;
  };

  /*
  ------------------------------------------------------------
   金額更新
  ------------------------------------------------------------
  */

  MS.Estimate.updateAmount = async function(estimateId, amount){
    const estimate = await MS.Estimate.get(estimateId);

    if(!estimate){
      throw new MS.Error("金額を更新する積算が見つかりません。", {
        estimateId: estimateId
      });
    }

    estimate.amount = MS.toNumber(amount, 0);
    estimate.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.estimates, estimate);

    await MS.Project.touch(estimate.projectId);

    return estimate;
  };

  /*
  ------------------------------------------------------------
   工事フォルダ用グループ化
  ------------------------------------------------------------
  */

  MS.Estimate.groupByApp = function(estimates){
    const groups = {};

    MS.toArray(estimates).forEach(function(estimate){
      const appType = estimate.appType || "other";

      if(!groups[appType]){
        groups[appType] = {
          appType: appType,
          label: MS.Estimate.getAppLabel(appType),
          count: 0,
          amount: 0,
          items: []
        };
      }

      groups[appType].count++;
      groups[appType].amount += MS.toNumber(estimate.amount, 0);
      groups[appType].items.push(estimate);
    });

    Object.keys(groups).forEach(function(appType){
      groups[appType].items = MS.sortByUpdatedDesc(groups[appType].items);
    });

    return groups;
  };

  MS.Estimate.getProjectFolder = async function(projectId){
    const targetProjectId = projectId || MS.getCurrentProjectId();

    if(!targetProjectId){
      return {
        project: null,
        estimates: [],
        groups: {},
        totalAmount: 0
      };
    }

    const project = await MS.Project.get(targetProjectId);
    const estimates = await MS.Estimate.listByProject(targetProjectId);
    const groups = MS.Estimate.groupByApp(estimates);

    const totalAmount = estimates.reduce(function(sum, estimate){
      return sum + MS.toNumber(estimate.amount, 0);
    }, 0);

    return {
      project: project,
      estimates: estimates,
      groups: groups,
      totalAmount: totalAmount
    };
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 04_price.txt

 役割：
 - Price名前空間
 - デフォルト単価
 - 工事別共通単価
 - 単価保存・読込
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("01_db_core が先に読み込まれていません。");
  }

  MS.Price = {};

  MS.Price.DEFAULT = {
    excavation: 4500,
    spoil: 4000,
    backfill: 3000,
    stone: 8500,
    levelingConcrete: 22000,
    mortar: 18000,
    form: 5500,
    nform: 5500,
    concrete: 35000,
    rebar: 220,
    product: 10000,
    gratingCover: 8000,
    concreteCover: 6000,
    coverLabor: 800,
    bed: 250
  };

  MS.Price.LABELS = {
    excavation: "掘削",
    spoil: "残土処理",
    backfill: "埋戻し",
    stone: "砕石",
    levelingConcrete: "均しコンクリート",
    mortar: "敷モルタル",
    form: "型枠",
    nform: "均し型枠",
    concrete: "コンクリート",
    rebar: "鉄筋",
    product: "製品",
    gratingCover: "グレーチング蓋",
    concreteCover: "コンクリート蓋",
    coverLabor: "蓋掛け手間",
    bed: "床付け"
  };

  MS.Price.normalize = function(prices){
    return MS.merge(MS.Price.DEFAULT, prices || {});
  };

  MS.Price.ensureDefaultPrices = async function(){
    const current = await MS.DB.get(MS.CONFIG.stores.settings, "defaultPrices");

    if(current && MS.isObject(current.value)){
      return MS.Price.normalize(current.value);
    }

    await MS.DB.put(MS.CONFIG.stores.settings, {
      key: "defaultPrices",
      value: MS.clone(MS.Price.DEFAULT),
      createdAt: MS.now(),
      updatedAt: MS.now()
    });

    return MS.clone(MS.Price.DEFAULT);
  };

  MS.Price.getDefaultPrices = async function(){
    const current = await MS.DB.get(MS.CONFIG.stores.settings, "defaultPrices");

    if(current && MS.isObject(current.value)){
      return MS.Price.normalize(current.value);
    }

    return MS.Price.ensureDefaultPrices();
  };

  MS.Price.saveDefaultPrices = async function(prices){
    const value = MS.Price.normalize(prices);

    await MS.DB.put(MS.CONFIG.stores.settings, {
      key: "defaultPrices",
      value: value,
      updatedAt: MS.now()
    });

    await MS.log("price", "デフォルト単価を保存しました。");

    return value;
  };

  MS.Price.resetDefaultPrices = async function(){
    await MS.DB.put(MS.CONFIG.stores.settings, {
      key: "defaultPrices",
      value: MS.clone(MS.Price.DEFAULT),
      updatedAt: MS.now()
    });

    return MS.clone(MS.Price.DEFAULT);
  };

  MS.Price.getProjectPrices = async function(projectId){
    const project = projectId
      ? await MS.Project.get(projectId)
      : await MS.Project.getCurrent();

    if(project && MS.isObject(project.prices)){
      return MS.Price.normalize(project.prices);
    }

    return MS.Price.getDefaultPrices();
  };

  MS.Price.saveProjectPrices = async function(prices, projectId){
    let project = projectId
      ? await MS.Project.get(projectId)
      : await MS.Project.ensureCurrent();

    if(!project){
      project = await MS.Project.create({ name: "未名称工事" });
    }

    project.prices = MS.Price.normalize(prices);
    project.updatedAt = MS.now();

    await MS.DB.put(MS.CONFIG.stores.projects, project);
    await MS.log("price", "工事単価を保存しました。", {
      projectId: project.id,
      name: project.name
    });

    return project.prices;
  };

  MS.Price.applyDefaultToProject = async function(projectId){
    const defaults = await MS.Price.getDefaultPrices();
    return MS.Price.saveProjectPrices(defaults, projectId);
  };

  MS.Price.get = async function(key, projectId){
    const prices = await MS.Price.getProjectPrices(projectId);
    return MS.toNumber(prices[key], 0);
  };

  MS.Price.set = async function(key, value, projectId){
    const prices = await MS.Price.getProjectPrices(projectId);
    prices[key] = MS.toNumber(value, 0);
    return MS.Price.saveProjectPrices(prices, projectId);
  };

  MS.Price.fromInputs = function(map){
    const result = {};

    Object.keys(map || {}).forEach(function(priceKey){
      const inputId = map[priceKey];
      const el = document.getElementById(inputId);

      if(el){
        result[priceKey] = MS.toNumber(el.value, 0);
      }
    });

    return result;
  };

  MS.Price.applyToInputs = function(prices, map){
    const normalized = MS.Price.normalize(prices);

    Object.keys(map || {}).forEach(function(priceKey){
      const inputId = map[priceKey];
      const el = document.getElementById(inputId);

      if(el && normalized[priceKey] !== undefined){
        el.value = normalized[priceKey];
      }
    });

    return normalized;
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 05_ui_01.txt

 役割：
 - UI名前空間
 - メッセージ表示
 - 確認ダイアログ
 - ローディング表示
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("01_db_core が先に読み込まれていません。");
  }

  MS.UI = {};

  MS.UI.message = function(message, type, duration){
    const msg = document.createElement("div");
    msg.textContent = message || "";
    msg.style.position = "fixed";
    msg.style.left = "50%";
    msg.style.bottom = "24px";
    msg.style.transform = "translateX(-50%)";
    msg.style.zIndex = "99999";
    msg.style.padding = "12px 18px";
    msg.style.borderRadius = "999px";
    msg.style.fontWeight = "900";
    msg.style.boxShadow = "0 10px 24px rgba(0,0,0,.18)";
    msg.style.fontFamily = "system-ui,-apple-system,'Noto Sans JP','Meiryo',sans-serif";
    msg.style.fontSize = "14px";

    if(type === "error"){
      msg.style.background = "#fff1f2";
      msg.style.color = "#b42318";
      msg.style.border = "1px solid #fecdd3";
    }else if(type === "warn"){
      msg.style.background = "#fff7ed";
      msg.style.color = "#c2410c";
      msg.style.border = "1px solid #fed7aa";
    }else{
      msg.style.background = "#0647a5";
      msg.style.color = "#fff";
      msg.style.border = "1px solid #0647a5";
    }

    document.body.appendChild(msg);

    setTimeout(function(){
      msg.style.opacity = "0";
      msg.style.transition = "opacity .25s ease";
      setTimeout(function(){
        if(msg.parentNode){
          msg.parentNode.removeChild(msg);
        }
      }, 300);
    }, duration || 1800);
  };

  MS.UI.alert = function(message){
    window.alert(message || "");
  };

  MS.UI.confirm = function(message){
    return window.confirm(message || "実行しますか？");
  };

  MS.UI.prompt = function(message, defaultValue){
    return window.prompt(message || "", defaultValue || "");
  };

  MS.UI.loading = function(message){
    let el = document.getElementById("msCommonLoading");

    if(!el){
      el = document.createElement("div");
      el.id = "msCommonLoading";
      el.style.position = "fixed";
      el.style.inset = "0";
      el.style.zIndex = "99998";
      el.style.display = "none";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.background = "rgba(8,24,48,.28)";
      el.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:18px 24px;box-shadow:0 18px 48px rgba(0,0,0,.25);font-weight:900;color:#0647a5;font-family:system-ui,-apple-system,Meiryo,sans-serif;">' +
        '<span id="msCommonLoadingText">処理中...</span>' +
        '</div>';
      document.body.appendChild(el);
    }

    const text = document.getElementById("msCommonLoadingText");
    if(text){
      text.textContent = message || "処理中...";
    }

    el.style.display = "flex";
  };

  MS.UI.hideLoading = function(){
    const el = document.getElementById("msCommonLoading");
    if(el){
      el.style.display = "none";
    }
  };

  MS.UI.safeRun = async function(fn, options){
    const opt = MS.isObject(options) ? options : {};

    try{
      if(opt.loading){
        MS.UI.loading(opt.loading);
      }

      const result = await fn();

      if(opt.success){
        MS.UI.message(opt.success, "success");
      }

      return result;
    }catch(error){
      console.error(error);

      if(opt.error !== false){
        MS.UI.message(opt.error || error.message || "エラーが発生しました。", "error", 2800);
      }

      throw error;
    }finally{
      if(opt.loading){
        MS.UI.hideLoading();
      }
    }
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 05_ui_02.txt

 役割：
 - 入力値補助
 - 共通ボタン
 - メイン画面へ戻る
 - アプリ共通初期化
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS || !MS.UI){
    throw new Error("05_ui_01.txt が先に読み込まれていません。");
  }

  MS.UI.getValue = function(id, fallback){
    const el = document.getElementById(id);
    if(!el){
      return fallback !== undefined ? fallback : "";
    }
    return el.value;
  };

  MS.UI.setValue = function(id, value){
    const el = document.getElementById(id);
    if(el){
      el.value = value === undefined || value === null ? "" : value;
    }
  };

  MS.UI.getNumber = function(id, fallback){
    return MS.toNumber(MS.UI.getValue(id, ""), fallback);
  };

  MS.UI.setText = function(id, value){
    const el = document.getElementById(id);
    if(el){
      el.textContent = value === undefined || value === null ? "" : value;
    }
  };

  MS.UI.bindClick = function(id, handler){
    const el = document.getElementById(id);
    if(!el){
      return false;
    }

    el.addEventListener("click", function(event){
      event.preventDefault();
      handler(event);
    });

    return true;
  };

  MS.UI.goHome = function(){
    window.location.href = "index.html";
  };

  MS.UI.addHomeButton = function(targetSelector){
    const target = document.querySelector(targetSelector || "header .wrap");

    if(!target || document.getElementById("msHomeButton")){
      return;
    }

    const a = document.createElement("a");
    a.id = "msHomeButton";
    a.href = "index.html";
    a.textContent = "🏠 メイン画面に戻る";
    a.style.display = "inline-flex";
    a.style.alignItems = "center";
    a.style.justifyContent = "center";
    a.style.gap = "6px";
    a.style.minWidth = "150px";
    a.style.height = "38px";
    a.style.padding = "0 14px";
    a.style.borderRadius = "999px";
    a.style.background = "rgba(255,255,255,.18)";
    a.style.color = "#fff";
    a.style.border = "1px solid rgba(255,255,255,.55)";
    a.style.textDecoration = "none";
    a.style.fontSize = "13px";
    a.style.fontWeight = "900";
    a.style.whiteSpace = "nowrap";

    target.appendChild(a);
  };

  MS.UI.fillProjectName = async function(inputId){
    const project = await MS.Project.getCurrent();
    const el = document.getElementById(inputId || "projectName");

    if(el && project){
      el.value = project.name || "";
    }

    return project;
  };

  MS.UI.initApp = async function(options){
    const opt = MS.isObject(options) ? options : {};

    await MS.init();

    if(opt.homeButton !== false){
      MS.UI.addHomeButton(opt.homeTarget || "header .wrap");
    }

    if(opt.projectNameInput){
      await MS.UI.fillProjectName(opt.projectNameInput);
    }

    if(opt.priceMap){
      const prices = await MS.Price.getProjectPrices();
      MS.Price.applyToInputs(prices, opt.priceMap);
    }

    if(opt.profitRateInput){
      await MS.Project.applyProfitRateToInput(
        opt.profitRateInput === true ? "ProfitRate" : opt.profitRateInput,
        opt.projectId,
        opt.defaultProfitRate !== undefined ? opt.defaultProfitRate : 20
      );
    }

    return true;
  };

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 06_utils.txt

 役割：
 - 金額表示
 - 数量表示
 - 日付表示
 - CSV補助
 - テキスト整形
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("01_db_core が先に読み込まれていません。");
  }

  MS.Utils = {};

  MS.Utils.yen = function(value){
    return Math.round(MS.toNumber(value, 0)).toLocaleString("ja-JP");
  };

  MS.Utils.money = function(value){
    return "￥" + MS.Utils.yen(value);
  };

  MS.Utils.qty = function(value, digits){
    const d = digits === undefined ? 3 : digits;
    return MS.toNumber(value, 0).toFixed(d);
  };

  MS.Utils.percent = function(value, digits){
    const d = digits === undefined ? 1 : digits;
    return (MS.toNumber(value, 0) * 100).toFixed(d) + "%";
  };

  MS.Utils.date = function(value){
    if(!value){
      return "";
    }

    const d = new Date(value);
    if(isNaN(d.getTime())){
      return String(value);
    }

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return y + "/" + m + "/" + day;
  };

  MS.Utils.datetime = function(value){
    if(!value){
      return "";
    }

    const d = new Date(value);
    if(isNaN(d.getTime())){
      return String(value);
    }

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");

    return y + "/" + m + "/" + day + " " + h + ":" + min;
  };

  MS.Utils.escapeHtml = function(value){
    return MS.toText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  MS.Utils.csvEscape = function(value){
    const text = MS.toText(value);

    if(/[",\n\r]/.test(text)){
      return '"' + text.replace(/"/g, '""') + '"';
    }

    return text;
  };

  MS.Utils.toCSV = function(rows, columns){
    const list = MS.toArray(rows);
    const cols = MS.toArray(columns);

    const header = cols.map(function(col){
      return MS.Utils.csvEscape(col.label || col.key);
    }).join(",");

    const body = list.map(function(row){
      return cols.map(function(col){
        return MS.Utils.csvEscape(row[col.key]);
      }).join(",");
    });

    return [header].concat(body).join("\n");
  };

  MS.Utils.downloadText = function(filename, text, mime){
    const blob = new Blob([text], {
      type: mime || "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(function(){
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  MS.yen = MS.Utils.yen;
  MS.money = MS.Utils.money;
  MS.qty = MS.Utils.qty;

})(window, document);

/*
============================================================
 MS積算システム 共通ライブラリ Ver.1.0.0
 07_export.txt

 役割：
 - 外部公開API
 - 旧軽量版との互換関数
 - 最終初期化
============================================================
*/

(function(window, document){
  "use strict";

  const MS = window.MS;

  if(!MS){
    throw new Error("MS共通ライブラリが正しく結合されていません。");
  }

  /*
  ------------------------------------------------------------
   旧軽量版との互換関数
  ------------------------------------------------------------
  */

  MS.createProject = function(data){
    return MS.Project.create(data);
  };

  MS.saveProject = function(project){
    return MS.Project.save(project);
  };

  MS.getCurrentProject = function(){
    return MS.Project.getCurrent();
  };

  MS.setCurrentProject = function(projectId){
    MS.setCurrentProjectId(projectId);
    return projectId;
  };

  MS.listProjects = function(){
    return MS.Project.listActive();
  };

  MS.deleteProject = function(projectId){
    return MS.Project.delete(projectId);
  };

  MS.duplicateProject = function(projectId){
    return MS.Project.duplicate(projectId);
  };

  MS.saveEstimate = function(appType, name, data){
    const payload = MS.isObject(data) ? MS.clone(data) : {};
    payload.name = name || payload.name || "未名称積算";
    return MS.Estimate.save(appType, payload);
  };

  MS.loadEstimate = function(estimateId){
    return MS.Estimate.load(estimateId);
  };

  MS.listEstimates = function(projectId, appType){
    if(projectId && appType){
      return MS.Estimate.listByProjectAndApp(projectId, appType);
    }

    if(projectId){
      return MS.Estimate.listByProject(projectId);
    }

    return MS.Estimate.list();
  };

  MS.deleteEstimate = function(estimateId){
    return MS.Estimate.delete(estimateId);
  };

  MS.getProjectProfitRate = function(projectId, fallback){
    return MS.Project.getProfitRate(projectId, fallback);
  };

  MS.saveProjectProfitRate = function(profitRate, projectId){
    return MS.Project.saveProfitRate(profitRate, projectId);
  };

  MS.applyProjectProfitRate = function(inputId, projectId, fallback){
    return MS.Project.applyProfitRateToInput(inputId, projectId, fallback);
  };

  MS.getDefaultPrices = function(){
    return MS.Price.getDefaultPrices();
  };

  MS.saveDefaultPrices = function(prices){
    return MS.Price.saveDefaultPrices(prices);
  };

  MS.getProjectPrices = function(){
    return MS.Price.getProjectPrices();
  };

  MS.saveProjectPrices = function(prices){
    return MS.Price.saveProjectPrices(prices);
  };

  MS.num = function(id){
    return MS.UI.getNumber(id, 0);
  };

  MS.val = function(id, value){
    const el = document.getElementById(id);

    if(!el){
      return "";
    }

    if(value !== undefined){
      el.value = value;
    }

    return el.value;
  };

  MS.goHome = function(){
    MS.UI.goHome();
  };

  /*
  ------------------------------------------------------------
   システム情報
  ------------------------------------------------------------
  */

  MS.info = function(){
    return {
      name: "MS積算システム 共通ライブラリ",
      version: MS.VERSION,
      dbName: MS.CONFIG.dbName,
      dbVersion: MS.CONFIG.dbVersion,
      ready: MS.DB.isReady(),
      stores: MS.CONFIG.stores
    };
  };

  /*
  ------------------------------------------------------------
   起動時自動初期化
  ------------------------------------------------------------
  */

  MS.ready = MS.init().then(function(){
    console.log("MS common library ready:", MS.info());
    return MS;
  }).catch(function(error){
    console.error("MS common library init error:", error);
    return MS;
  });

  window.MS = MS;

})(window, document);


/* ===== MS積算システム 保存安定化パッチ v43 =====
  方針：
  - 以前の ms_common 本体は省略しない
  - 保存の正本は IndexedDB の projects / estimates のみ
  - 工事は projectId、部材は estimateId で完全に分離
  - 現在の部材IDは「現場ごと＋アプリごと」に分けて保存
  - 現場を切り替えた時に、前の現場の部材IDを引きずらない
============================================================ */
(function(window, document){
  "use strict";
  const MS = window.MS;
  if(!MS) return;

  const DEFAULT_PROJECT_NAME = "未名称工事";
  const APP_ALIAS = {
    L:"l_wall", l:"l_wall", l_wall:"l_wall", L_WALL:"l_wall",
    U:"u_gutter", u:"u_gutter", u_gutter:"u_gutter", U_GUTTER:"u_gutter",
    G:"genbau_u_gutter", g:"genbau_u_gutter", GENBAU_U:"genbau_u_gutter", genbau_u_gutter:"genbau_u_gutter", K:"kahen_sokkou", k:"kahen_sokkou", KAHEN:"kahen_sokkou", kahen_sokkou:"kahen_sokkou", P:"precast_l_wall", p:"precast_l_wall", PRECAST_L:"precast_l_wall", precast_l_wall:"precast_l_wall", DRAINAGE_PIT:"genbau_drainage_pit", GENBAU_DRAINAGE_PIT:"genbau_drainage_pit", genbau_drainage_pit:"genbau_drainage_pit", CURB:"curb", curb:"curb", PEDESTRIAN_VEHICLE_BLOCK:"pedestrian_vehicle_boundary_block", pedestrian_vehicle_boundary_block:"pedestrian_vehicle_boundary_block", L_GUTTER:"l_gutter", l_gutter:"l_gutter", GRAVITY_WALL:"gravity_wall", gravity_wall:"gravity_wall", ANKYO_CULVERT:"ankyo_culvert", ankyo_culvert:"ankyo_culvert", DRAINAGE_PIPE:"drainage_pipe", drainage_pipe:"drainage_pipe", PRECAST_DRAINAGE_BASIN:"precast_drainage_basin", precast_drainage_basin:"precast_drainage_basin", FIRE_TANK:"fire_tank", fire_tank:"fire_tank"
  };
  const APP_LABEL = {l_wall:"L型擁壁", u_gutter:"U型側溝", genbau_u_gutter:"現場打U型側溝", kahen_sokkou:"可変側溝", precast_l_wall:"プレキャストL型擁壁", genbau_drainage_pit:"現場打排水桝", curb:"縁石工", pedestrian_vehicle_boundary_block:"歩車道ブロック工", l_gutter:"L型側溝工", mikiri_concrete:"見切コンクリート", gravity_wall:"重力式擁壁", ankyo_culvert:"暗渠・カルバート工", drainage_pipe:"排水管工", precast_drainage_basin:"プレキャスト集水桝", fire_tank:"防火水槽工"};
  const CURRENT_PROJECT_KEY = "ms_current_project_id";
  const GLOBAL_EST_PREFIX = (MS.CONFIG && MS.CONFIG.currentEstimateKeyPrefix) || "ms_current_estimate_id_";
  const PROJECT_EST_PREFIX = "ms_current_estimate_id_by_project_";

  function now(){ return (typeof MS.now === "function") ? MS.now() : new Date().toISOString(); }
  function createId(prefix){ return (typeof MS.createId === "function") ? MS.createId(prefix||"id") : (prefix||"id") + "_" + Date.now() + "_" + Math.random().toString(36).slice(2,9); }
  function isObj(v){ return v && typeof v === "object" && !Array.isArray(v); }
  function txt(v){ return (v === null || v === undefined) ? "" : String(v).trim(); }
  function num(v){ const n=Number(v); return isNaN(n)||!isFinite(n)?0:n; }
  function clone(v){ try{return JSON.parse(JSON.stringify(v));}catch(e){return v;} }
  function normalizeAppType(appType){ return APP_ALIAS[appType] || txt(appType) || "other"; }
  MS.normalizeAppType = normalizeAppType;
  MS.APP_LABEL = APP_LABEL;

  function stores(){ return (MS.CONFIG && MS.CONFIG.stores) || {projects:"projects", estimates:"estimates", settings:"settings", prices:"prices", logs:"logs"}; }
  async function ready(){ if(MS.ready && typeof MS.ready.then === "function"){ try{ await MS.ready; }catch(e){} } if(MS.DB && MS.DB.open){ await MS.DB.open(); } else if(MS.init){ await MS.init(); } }
  async function put(store, value){ await ready(); if(MS.DB && MS.DB.put) return MS.DB.put(store, value); throw new Error("DB保存関数がありません"); }
  async function get(store, key){ await ready(); if(!key) return null; if(MS.DB && MS.DB.get) return MS.DB.get(store, key); return null; }
  async function getAll(store){ await ready(); if(MS.DB && MS.DB.getAll) return MS.DB.getAll(store); return []; }
  async function del(store, key){ await ready(); if(MS.DB && MS.DB.delete) return MS.DB.delete(store, key); return false; }

  function appKeys(){ return Object.keys(APP_LABEL || {}); }
  function projectEstimateKey(projectId, appType){ return PROJECT_EST_PREFIX + normalizeAppType(appType) + "_" + txt(projectId); }
  function clearGlobalEstimateIds(){
    appKeys().forEach(a => { try{ localStorage.removeItem(GLOBAL_EST_PREFIX + a); }catch(e){} });
    ["ms_open_estimate_id","ms_load_estimate_id","loadEstimateId","currentEstimateId"].forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
  }
  function getCurrentProjectId(){ return localStorage.getItem(CURRENT_PROJECT_KEY) || ""; }
  function setCurrentProjectId(id){
    const old = getCurrentProjectId();
    const next = txt(id);
    if(next){ localStorage.setItem(CURRENT_PROJECT_KEY, next); }
    else{ localStorage.removeItem(CURRENT_PROJECT_KEY); }
    if(old && next && old !== next){ clearGlobalEstimateIds(); }
    return next;
  }
  function setCurrentEstimateId(appType, estimateId){
    const app = normalizeAppType(appType);
    const pid = getCurrentProjectId();
    const id = txt(estimateId);
    if(pid){
      const key = projectEstimateKey(pid, app);
      if(id) localStorage.setItem(key, id); else localStorage.removeItem(key);
    }
    if(id) localStorage.setItem(GLOBAL_EST_PREFIX + app, id); else localStorage.removeItem(GLOBAL_EST_PREFIX + app);
    return id;
  }
  function getCurrentEstimateId(appType){
    const app = normalizeAppType(appType);
    const pid = getCurrentProjectId();
    if(pid){
      const v = localStorage.getItem(projectEstimateKey(pid, app));
      if(v) return v;
    }
    return "";
  }
  function clearCurrentEstimateId(appType){ return setCurrentEstimateId(appType, ""); }

  function normalizeProject(p){
    if(!isObj(p)) return null;
    const name = txt(p.name || p.projectName || p.koujiName) || DEFAULT_PROJECT_NAME;
    return Object.assign({}, p, {
      id: txt(p.id) || createId("project"),
      name, projectName:name,
      client: txt(p.client || p.clientName), clientName: txt(p.clientName || p.client),
      site: txt(p.site || p.siteName), siteName: txt(p.siteName || p.site),
      memo: txt(p.memo), prices: isObj(p.prices) ? p.prices : {},
      status: p.status === "deleted" ? "deleted" : "active",
      createdAt: p.createdAt || now(), updatedAt: p.updatedAt || now()
    });
  }
  async function listProjectsAll(){ return (await getAll(stores().projects)).map(normalizeProject).filter(Boolean).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||""))); }
  async function listProjectsActive(){ return (await listProjectsAll()).filter(p => p.status !== "deleted"); }
  async function getProjectById(id){ return normalizeProject(await get(stores().projects, id)); }
  async function findProjectByName(name){ const t=txt(name); if(!t) return null; return (await listProjectsActive()).find(p => txt(p.name) === t) || null; }

  async function saveProject(project, options){
    await ready();
    const opt = isObj(options) ? options : {};
    const input = isObj(project) ? clone(project) : {};
    let current = getCurrentProjectId();
    let old = input.id ? await getProjectById(input.id) : (current ? await getProjectById(current) : null);
    const name = txt(input.name || input.projectName || (old && old.name)) || DEFAULT_PROJECT_NAME;
    if(old && txt(old.name) !== name && opt.forceUpdate !== true){
      const same = await findProjectByName(name);
      old = same || null;
      input.id = old ? old.id : "";
    }
    const p = normalizeProject(Object.assign({}, old || {}, input, {id:(old&&old.id)||input.id||createId("project"), name, projectName:name, updatedAt:now()}));
    await put(stores().projects, p);
    setCurrentProjectId(p.id);
    return p;
  }
  async function createProject(data){
    const input = isObj(data) ? clone(data) : {};
    const name = txt(input.name || input.projectName) || DEFAULT_PROJECT_NAME;
    const same = await findProjectByName(name);
    if(same){ setCurrentProjectId(same.id); return same; }
    input.id = input.id || createId("project"); input.name = name; input.projectName = name;
    return saveProject(input, {forceUpdate:true});
  }
  async function getCurrentProject(){ const id=getCurrentProjectId(); return id ? getProjectById(id) : null; }
  async function ensureCurrentProject(){ return (await getCurrentProject()) || createProject({name:DEFAULT_PROJECT_NAME, projectName:DEFAULT_PROJECT_NAME}); }

  function domName(){
    const ids = ["estimateName","saveName","dataName","itemName","memberName","buzaiName","buzai","partName","materialName","sekisanName","title","name"];
    for(const id of ids){ const el = document.getElementById(id); if(el && txt(el.value)) return txt(el.value); }

    // 各アプリでID名が違っても拾えるように、入力欄の name/id/placeholder も確認する
    const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
    const goodKey = /(部材|材料|名称|名前|品名|タイトル|件名|estimate|buzai|member|part|item|material|title|name)/i;
    const badKey = /(project|kouji|工事|現場|client|発注|site|場所|memo|単価|price|数量|amount|total|length|width|height|common)/i;
    for(const el of inputs){
      const key = [el.id, el.name, el.getAttribute("placeholder"), el.getAttribute("aria-label")].join(" ");
      if(goodKey.test(key) && !badKey.test(key) && txt(el.value)){
        return txt(el.value);
      }
    }
    return "";
  }

  function findNameDeep(obj, depth){
    if(depth > 5 || !isObj(obj)) return "";
    const goodKey = /(部材|材料|名称|名前|品名|タイトル|件名|estimate|buzai|member|part|item|material|title|name)/i;
    const badKey = /(project|kouji|工事|現場|client|発注|site|場所|memo|単価|price|数量|amount|total|length|width|height|common)/i;
    const keys = Object.keys(obj);
    for(const k of keys){
      if(goodKey.test(k) && !badKey.test(k)){
        const v = obj[k];
        if(typeof v === "string" || typeof v === "number"){ const t = txt(v); if(t) return t; }
      }
    }
    for(const k of keys){
      const v = obj[k];
      if(isObj(v)){ const t = findNameDeep(v, depth + 1); if(t) return t; }
      if(Array.isArray(v)){
        for(const item of v){ if(isObj(item)){ const t = findNameDeep(item, depth + 1); if(t) return t; } }
      }
    }
    return "";
  }

  function deriveEstimateName(appType, data, nameArg){
    const d = isObj(data) ? data : {};
    const nested = isObj(d.data) ? d.data : {};
    const values = isObj(d.values) ? d.values : (isObj(nested.values) ? nested.values : {});
    const candidates = [nameArg, d.name, d.estimateName, d.buzaiName, d.memberName, d.partName, d.itemName, d.materialName, nested.name, nested.estimateName, values.name, values.estimateName, values.buzaiName, values.memberName, values.partName, findNameDeep(d,0), domName()];
    for(const c of candidates){ const t=txt(c); if(t) return t; }

    // 名前が取れない場合は、同じアプリで上書きされないよう時刻入り名称にする
    return (APP_LABEL[appType] || "積算") + " " + new Date().toLocaleString("ja-JP", {year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit"});
  }
  function deriveAmount(data){
    const d = isObj(data) ? data : {};
    const candidates = [d.amount, d.totalAmount, d.total, d.grandTotal, d.result && d.result.totalAmount, d.data && d.data.amount, d.data && d.data.totalAmount];
    for(const c of candidates){ if(c !== undefined && c !== null && c !== "") return num(c); }
    return 0;
  }
  function normalizeEstimateArgs(appType, arg2, arg3){
    const type = normalizeAppType(appType);
    let nameArg="", data={};
    if(isObj(arg2) && arg3 === undefined){ data=clone(arg2); nameArg=data.name || data.estimateName || ""; }
    else{ nameArg=txt(arg2); data=isObj(arg3) ? clone(arg3) : {}; }
    const name = deriveEstimateName(type, data, nameArg);
    return {appType:type, name, data};
  }
  async function listEstimatesAll(){
    return (await getAll(stores().estimates)).map(e=>{
      e = isObj(e) ? clone(e) : {};
      e.appType = normalizeAppType(e.appType || e.app);
      e.name = txt(e.name || e.estimateName) || "名称未設定";
      e.estimateName = e.name;
      e.projectId = txt(e.projectId);
      e.projectName = txt(e.projectName);
      return e;
    }).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
  }
  function stableSignature(obj){
    try{
      return JSON.stringify(obj || {}, function(k, v){
        if(k === "updatedAt" || k === "createdAt") return undefined;
        return v;
      });
    }catch(e){ return String(Date.now()); }
  }

  function shouldUpdateExisting(payload, all, project){
    const data = payload.data || {};
    const explicitId = txt(data.id || data.estimateId || data.currentEstimateId || data._estimateId);
    const forceUpdate = data.__updateExisting === true || data.updateExisting === true || data.mode === "update";
    if(!explicitId) return null;

    const hit = all.find(e => e.id === explicitId);
    if(!hit) return null;
    if(hit.projectId !== project.id) return null;
    if(normalizeAppType(hit.appType) !== payload.appType) return null;

    // 呼び出したデータを明示的に「更新」する場合だけ上書き。
    // 通常の「登録」は、同じアプリでも新規部材として保存する。
    if(forceUpdate) return hit;
    return null;
  }

  async function saveEstimate(appType, arg2, arg3){
    await ready();
    const project = await ensureCurrentProject();
    const payload = normalizeEstimateArgs(appType, arg2, arg3);
    const all = await listEstimatesAll();
    const old = shouldUpdateExisting(payload, all, project);

    // 重要：通常の「登録」は必ず新規保存。
    // 以前のように「同じアプリ」「同じ名前」「現在ID」で上書きしない。
    const newId = createId("estimate");
    const estimate = Object.assign({}, old || {}, {
      id: old ? old.id : newId,
      projectId: project.id, projectName: project.name,
      appType: payload.appType, app: payload.appType, appLabel: APP_LABEL[payload.appType] || payload.appType,
      name: payload.name, estimateName: payload.name,
      data: payload.data,
      values: payload.data.values || (payload.data.data && payload.data.data.values) || payload.data,
      amount: deriveAmount(payload.data), quantities: payload.data.quantities || {}, prices: payload.data.prices || {}, printData: payload.data.printData || {},
      signature: stableSignature(payload.data),
      createdAt: old && old.createdAt ? old.createdAt : now(), updatedAt: now()
    });
    await put(stores().estimates, estimate);
    project.updatedAt = now(); await put(stores().projects, project);
    setCurrentProjectId(project.id);

    // 保存後も「現在ID」はこの部材にします。ただし次回の通常登録では上書きに使いません。
    setCurrentEstimateId(payload.appType, estimate.id);
    try{ sessionStorage.setItem("ms_keep_project_on_main", "1"); }catch(e){}
    return estimate;
  }
  async function getEstimate(id){ return (await listEstimatesAll()).find(e => e.id === id) || null; }
  async function loadEstimate(id){ const e = await getEstimate(id); if(e){ setCurrentProjectId(e.projectId); setCurrentEstimateId(e.appType, e.id); } return e; }
  async function listEstimates(arg1, arg2){
    await ready();
    let projectId="", appType="";
    const n1=normalizeAppType(arg1);
    if(arg1 && APP_LABEL[n1] && !arg2){ projectId=getCurrentProjectId(); appType=n1; }
    else{ projectId=txt(arg1); appType=arg2 ? normalizeAppType(arg2) : ""; }
    return (await listEstimatesAll()).filter(e => (!projectId || e.projectId === projectId) && (!appType || normalizeAppType(e.appType) === appType));
  }
  async function deleteEstimate(id){ return del(stores().estimates, id); }
  async function deleteProject(id){ const estimates=await listEstimates(id); for(const e of estimates){ await del(stores().estimates, e.id); } await del(stores().projects, id); if(getCurrentProjectId()===id) setCurrentProjectId(""); return true; }

  async function getDefaultPrices(){ await ready(); const row=await get(stores().settings,"defaultPrices"); if(row && isObj(row.value)) return row.value; return (MS.Price && MS.Price.DEFAULT) ? clone(MS.Price.DEFAULT) : {}; }
  async function saveDefaultPrices(prices){ await put(stores().settings,{key:"defaultPrices", value:isObj(prices)?prices:{}, updatedAt:now()}); return isObj(prices)?prices:{}; }
  async function getProjectPrices(){ const p=await getCurrentProject(); return p && isObj(p.prices) ? Object.assign({}, await getDefaultPrices(), p.prices) : getDefaultPrices(); }
  async function saveProjectPrices(prices){ const p=await ensureCurrentProject(); p.prices=isObj(prices)?prices:{}; await saveProject(p,{forceUpdate:true}); return p.prices; }

  MS.getCurrentProjectId = getCurrentProjectId;
  MS.setCurrentProjectId = setCurrentProjectId;
  MS.clearCurrentProjectId = function(){ setCurrentProjectId(""); clearGlobalEstimateIds(); };
  MS.setCurrentEstimateId = setCurrentEstimateId;
  MS.getCurrentEstimateId = getCurrentEstimateId;
  MS.clearCurrentEstimateId = clearCurrentEstimateId;
  MS.createProject = createProject;
  MS.saveProject = saveProject;
  MS.getProject = getProjectById;
  MS.getCurrentProject = getCurrentProject;
  MS.ensureCurrentProject = ensureCurrentProject;
  MS.listProjects = listProjectsActive;
  MS.deleteProject = deleteProject;
  MS.saveEstimate = saveEstimate;
  MS.getEstimate = getEstimate;
  MS.loadEstimate = loadEstimate;
  MS.listEstimates = listEstimates;
  MS.deleteEstimate = deleteEstimate;
  MS.getDefaultPrices = getDefaultPrices;
  MS.saveDefaultPrices = saveDefaultPrices;
  MS.getProjectPrices = getProjectPrices;
  MS.saveProjectPrices = saveProjectPrices;
  MS.resetMainStartupProject = function(){ setCurrentProjectId(""); clearGlobalEstimateIds(); };
})(window, document);

/* v44: 工事を開くボタン対応・各アプリ複数保存対応 */


/* ===== v45 根本補強：各アプリ保存を必ず複数件化・参照現場を保持 =====
  目的：
  - 個別アプリが MS.saveEstimate ではなく MS.Estimate.save を呼ぶ場合でも、
    前回IDで上書きせず、通常の「登録」は必ず新規部材として保存する。
  - 保存データから別現場の部材を開いた後、メイン画面へ戻ってもその現場を保持する。
============================================================ */
(function(window, document){
  "use strict";
  const MS = window.MS;
  if(!MS) return;

  const RETURN_PROJECT_KEY = "ms_return_project_id";
  const PRESERVE_KEY = "ms_preserve_project_on_main";
  const APP_ALIAS = {
    L:"l_wall", l:"l_wall", l_wall:"l_wall", L_WALL:"l_wall",
    U:"u_gutter", u:"u_gutter", u_gutter:"u_gutter", U_GUTTER:"u_gutter",
    G:"genbau_u_gutter", g:"genbau_u_gutter", GENBAU_U:"genbau_u_gutter", genbau_u_gutter:"genbau_u_gutter", K:"kahen_sokkou", k:"kahen_sokkou", KAHEN:"kahen_sokkou", kahen_sokkou:"kahen_sokkou", P:"precast_l_wall", p:"precast_l_wall", PRECAST_L:"precast_l_wall", precast_l_wall:"precast_l_wall", DRAINAGE_PIT:"genbau_drainage_pit", GENBAU_DRAINAGE_PIT:"genbau_drainage_pit", genbau_drainage_pit:"genbau_drainage_pit", CURB:"curb", curb:"curb", PEDESTRIAN_VEHICLE_BLOCK:"pedestrian_vehicle_boundary_block", pedestrian_vehicle_boundary_block:"pedestrian_vehicle_boundary_block", L_GUTTER:"l_gutter", l_gutter:"l_gutter", GRAVITY_WALL:"gravity_wall", gravity_wall:"gravity_wall", ANKYO_CULVERT:"ankyo_culvert", ankyo_culvert:"ankyo_culvert", DRAINAGE_PIPE:"drainage_pipe", drainage_pipe:"drainage_pipe", PRECAST_DRAINAGE_BASIN:"precast_drainage_basin", precast_drainage_basin:"precast_drainage_basin", FIRE_TANK:"fire_tank", fire_tank:"fire_tank"
  };
  function txt(v){ return v === null || v === undefined ? "" : String(v).trim(); }
  function app(appType){ return APP_ALIAS[appType] || txt(appType) || "other"; }
  function markReturnProject(projectId){
    const pid = txt(projectId || (MS.getCurrentProjectId && MS.getCurrentProjectId()));
    if(!pid) return;
    try{
      localStorage.setItem(RETURN_PROJECT_KEY, pid);
      localStorage.setItem(PRESERVE_KEY, "1");
      sessionStorage.setItem("ms_keep_project_on_main", "1");
    }catch(e){}
  }

  const baseSaveEstimate = MS.saveEstimate;
  if(typeof baseSaveEstimate === "function"){
    const stableSave = async function(appType, arg2, arg3){
      // 通常の登録では、各アプリが持っている前回IDを保存データから外す。
      // これにより、U型側溝・現場打U型側溝でも毎回同じ1件を上書きしない。
      if(arg2 && typeof arg2 === "object" && arg3 === undefined){
        const data = JSON.parse(JSON.stringify(arg2));
        delete data.id;
        delete data.estimateId;
        delete data.currentEstimateId;
        delete data._estimateId;
        if(data.data && typeof data.data === "object"){
          delete data.data.id;
          delete data.data.estimateId;
          delete data.data.currentEstimateId;
          delete data.data._estimateId;
        }
        const saved = await baseSaveEstimate.call(MS, app(appType), data);
        markReturnProject(saved && saved.projectId);
        return saved;
      }
      if(arg3 && typeof arg3 === "object"){
        const data = JSON.parse(JSON.stringify(arg3));
        delete data.id;
        delete data.estimateId;
        delete data.currentEstimateId;
        delete data._estimateId;
        if(data.data && typeof data.data === "object"){
          delete data.data.id;
          delete data.data.estimateId;
          delete data.data.currentEstimateId;
          delete data.data._estimateId;
        }
        const saved = await baseSaveEstimate.call(MS, app(appType), arg2, data);
        markReturnProject(saved && saved.projectId);
        return saved;
      }
      const saved = await baseSaveEstimate.call(MS, app(appType), arg2, arg3);
      markReturnProject(saved && saved.projectId);
      return saved;
    };

    MS.saveEstimate = stableSave;
    MS.registerEstimate = stableSave;
    MS.saveCurrentEstimate = stableSave;

    MS.Estimate = MS.Estimate || {};
    MS.Estimate.save = stableSave;

    // 既存アプリが MS.Estimate.load / get / list 系を呼んでも、v43以降の正しい保存先を見る。
    if(typeof MS.loadEstimate === "function"){
      const baseLoadEstimate = MS.loadEstimate;
      MS.loadEstimate = async function(estimateId){
        const e = await baseLoadEstimate.call(MS, estimateId);
        if(e){
          if(MS.setCurrentProjectId) MS.setCurrentProjectId(e.projectId);
          if(MS.setCurrentEstimateId) MS.setCurrentEstimateId(e.appType || e.app, e.id);
          markReturnProject(e.projectId);
        }
        return e;
      };
      MS.Estimate.load = MS.loadEstimate;
    }
    if(typeof MS.getEstimate === "function") MS.Estimate.get = function(id){ return MS.getEstimate(id); };
    if(typeof MS.listEstimates === "function"){
      MS.Estimate.list = function(){ return MS.listEstimates(); };
      MS.Estimate.listByProject = function(projectId){ return MS.listEstimates(projectId); };
      MS.Estimate.listByApp = function(appType){ return MS.listEstimates(null, app(appType)); };
      MS.Estimate.listByProjectAndApp = function(projectId, appType){ return MS.listEstimates(projectId, app(appType)); };
    }
    if(typeof MS.deleteEstimate === "function") MS.Estimate.delete = function(id){ return MS.deleteEstimate(id); };
  }

  // 保存データから部材を開く時点で、戻り先の現場IDを明示的に残す。
  const originalSetCurrentProjectId = MS.setCurrentProjectId;
  if(typeof originalSetCurrentProjectId === "function"){
    MS.setCurrentProjectId = function(projectId){
      const r = originalSetCurrentProjectId.call(MS, projectId);
      if(projectId) markReturnProject(projectId);
      return r;
    };
  }
})(window, document);


/* ===== Ver.1.0 保存システム完成補強：バックアップ・復元・完全削除確認用API ===== */
(function(window, document){
  "use strict";
  const MS = window.MS;
  if(!MS) return;

  function now(){
    return (MS.now && MS.now()) || new Date().toISOString();
  }
  function clone(v){
    try{ return JSON.parse(JSON.stringify(v)); }catch(e){ return v; }
  }
  function stores(){
    return (MS.CONFIG && MS.CONFIG.stores) || {
      projects:"projects",
      estimates:"estimates",
      settings:"settings",
      prices:"prices",
      logs:"logs",
      productMasters:"productMasters"
    };
  }
  async function ready(){
    if(MS.ready && MS.ready.then) await MS.ready;
    if(MS.init) await MS.init();
    if(MS.DB && MS.DB.open) await MS.DB.open();
  }
  async function getAll(storeName){
    await ready();
    if(MS.DB && MS.DB.getAll) return MS.DB.getAll(storeName);
    return [];
  }
  async function clear(storeName){
    await ready();
    if(MS.DB && MS.DB.clear) return MS.DB.clear(storeName);
    return true;
  }
  async function putMany(storeName, rows){
    await ready();
    const list = Array.isArray(rows) ? rows : [];
    if(MS.DB && MS.DB.putMany) return MS.DB.putMany(storeName, list);
    if(MS.DB && MS.DB.put){
      for(const row of list){ await MS.DB.put(storeName, row); }
    }
    return list;
  }

  MS.exportAllData = async function(){
    await ready();
    const st = stores();
    const data = {
      schema: "MS_SEKISAN_BACKUP",
      version: "1.0",
      app: "MS積算システム",
      exportedAt: now(),
      dbName: MS.CONFIG && MS.CONFIG.dbName,
      dbVersion: MS.CONFIG && MS.CONFIG.dbVersion,
      currentProjectId: MS.getCurrentProjectId ? MS.getCurrentProjectId() : "",
      data: {
        projects: await getAll(st.projects),
        estimates: await getAll(st.estimates),
        settings: await getAll(st.settings),
        prices: await getAll(st.prices),
        logs: await getAll(st.logs),
        productMasters: st.productMasters ? await getAll(st.productMasters) : []
      }
    };
    return clone(data);
  };

  MS.importAllData = async function(backup, options){
    await ready();
    const opt = options || {};
    if(!backup || backup.schema !== "MS_SEKISAN_BACKUP" || !backup.data){
      throw new Error("MS積算システムのバックアップファイルではありません。");
    }
    const st = stores();
    const data = backup.data || {};
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const estimates = Array.isArray(data.estimates) ? data.estimates : [];
    const settings = Array.isArray(data.settings) ? data.settings : [];
    const prices = Array.isArray(data.prices) ? data.prices : [];
    const logs = Array.isArray(data.logs) ? data.logs : [];
    const productMasters = Array.isArray(data.productMasters) ? data.productMasters : [];

    if(opt.replace !== false){
      await clear(st.projects);
      await clear(st.estimates);
      await clear(st.settings);
      await clear(st.prices);
      await clear(st.logs);
      if(st.productMasters) await clear(st.productMasters);
    }

    await putMany(st.projects, projects);
    await putMany(st.estimates, estimates);
    await putMany(st.settings, settings);
    await putMany(st.prices, prices);
    await putMany(st.logs, logs);
    if(st.productMasters) await putMany(st.productMasters, productMasters);

    if(MS.setCurrentProjectId){
      const pid = backup.currentProjectId || (projects[0] && projects[0].id) || "";
      MS.setCurrentProjectId(pid);
    }
    if(MS.log){
      try{ await MS.log("system", "バックアップを復元しました。", {projectCount:projects.length, estimateCount:estimates.length}); }catch(e){}
    }
    return {projects:projects.length, estimates:estimates.length, settings:settings.length, prices:prices.length, logs:logs.length, productMasters:productMasters.length};
  };

  MS.downloadBackup = async function(){
    const backup = await MS.exportAllData();
    const stamp = new Date().toISOString().replace(/[-:]/g,"").replace(/T/,"_").slice(0,15);
    const filename = "MS_Save_" + stamp + ".json";
    const text = JSON.stringify(backup, null, 2);
    const blob = new Blob([text], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      if(a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    return backup;
  };
})(window, document);

/*
============================================================
 MS積算システム 共通単価マスター追加パッチ Ver.1.0
 file: ms_common_unit_master_patch.js

 目的：
 - 共通単価を「標準」「公共工事」など名前付きで保存
 - 現在使用中の共通単価を全アプリで共有
 - 積算保存時に、単価名＋単価スナップショットを一緒に保存
============================================================
*/
(function(window, document){
  'use strict';

  const MASTER_KEY = 'msSekisanPriceMasters_v1';
  const ACTIVE_KEY = 'msSekisanActivePriceMasterId_v1';
  const LEGACY_DEFAULT_KEY = 'msSekisanDefaultPrices_v1';
  const LEGACY_COMMON_KEY = 'msSekisanCommon_v1';

  const PRICE_KEYS = [
    'Pexc','Pspoil','Pback','Pbed','Pstone','Plean','PleanForm','Pmortar','Pconc','Pform','Prebar',
    'Pset','ProdLen','ProdPrice','Pgrating','Ngrating','Pconcllid','Nconcllid','Plidwork','PlidWork','Pinvert'
  ];

  const DEFAULT_PRICES = {
    Pexc:4500, Pspoil:4000, Pback:3000, Pbed:250, Pstone:8500,
    Plean:22000, PleanForm:5500, Pmortar:18000, Pconc:35000, Pform:5500, Prebar:220,
    Pset:2500, ProdLen:2, ProdPrice:20000, Pgrating:0, Ngrating:0, Pconcllid:0, Nconcllid:0, Plidwork:0, PlidWork:0, Pinvert:25000
  };

  const ALIASES = {
    excavation:'Pexc', spoil:'Pspoil', backfill:'Pback', bed:'Pbed', stone:'Pstone',
    levelingConcrete:'Plean', blindingConcrete:'Plean', Pblnd:'Plean',
    levelingForm:'PleanForm', nform:'PleanForm', Pnform:'PleanForm',
    mortar:'Pmortar', concrete:'Pconc', form:'Pform', rebar:'Prebar',
    product:'ProdPrice', productLength:'ProdLen', gratingCover:'Pgrating', concreteCover:'Pconcllid', coverLabor:'PlidWork', lidWork:'PlidWork', invertConcrete:'Pinvert'
  };

  function now(){ return new Date().toISOString(); }
  function id(prefix){ return (prefix || 'pm') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); }
  function read(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function clone(obj){ return JSON.parse(JSON.stringify(obj || {})); }
  function normalizePrices(prices){
    const out = {};
    prices = prices || {};
    Object.keys(prices).forEach(k => {
      const key = ALIASES[k] || k;
      if(PRICE_KEYS.includes(key) && prices[k] !== undefined && prices[k] !== null && String(prices[k]) !== ''){
        out[key] = Number(prices[k]);
      }
    });
    return out;
  }
  function collectFields(){
    const prices = {};
    PRICE_KEYS.forEach(k => {
      const el = document.getElementById(k) || document.getElementById('cp_' + k) || document.getElementById('def_' + k);
      if(el && el.value !== '') prices[k] = Number(el.value);
    });
    return prices;
  }
  function applyFields(prices, prefix){
    prices = normalizePrices(prices);
    PRICE_KEYS.forEach(k => {
      const ids = prefix ? [prefix + k] : [k, 'cp_' + k, 'def_' + k];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if(el && prices[k] !== undefined) el.value = prices[k];
      });
    });
  }
  function legacyPrices(){
    const def = normalizePrices(read(LEGACY_DEFAULT_KEY, {}));
    const common = read(LEGACY_COMMON_KEY, {});
    const commonPrices = normalizePrices(common && common.prices ? common.prices : {});
    return Object.assign({}, DEFAULT_PRICES, def, commonPrices);
  }
  function ensureMasters(){
    let list = read(MASTER_KEY, null);
    if(!Array.isArray(list) || !list.length){
      list = [{ id:'standard', name:'標準', prices:legacyPrices(), createdAt:now(), updatedAt:now(), memo:'標準単価' }];
      write(MASTER_KEY, list);
      if(!localStorage.getItem(ACTIVE_KEY)) localStorage.setItem(ACTIVE_KEY, 'standard');
    }
    return list;
  }
  function saveMasters(list){ write(MASTER_KEY, list || []); }
  function activeId(){
    ensureMasters();
    const v = localStorage.getItem(ACTIVE_KEY);
    if(v) return v;
    const byName = localStorage.getItem('msSekisanActivePriceMasterName_v1');
    if(byName){
      const hit = ensureMasters().find(x => x.name === byName);
      if(hit){ localStorage.setItem(ACTIVE_KEY, hit.id); return hit.id; }
    }
    return 'standard';
  }
  function setActive(id){
    const list = ensureMasters();
    let item = list.find(x => x.id === (id || 'standard')) || list[0];
    localStorage.setItem(ACTIVE_KEY, (item && item.id) || 'standard');
    if(item){
      localStorage.setItem('msSekisanActivePriceMasterName_v1', item.name || '標準');
      try{ localStorage.setItem('msSekisanActivePriceMasterSnapshot_v1', JSON.stringify(item.prices || {})); }catch(e){}
    }
    window.dispatchEvent(new CustomEvent('ms-price-master-changed', {detail:{id:activeId(), name:item && item.name}}));
  }
  function getActive(){
    const list = ensureMasters();
    let item = list.find(x => x.id === activeId());
    if(!item){
      const byName = localStorage.getItem('msSekisanActivePriceMasterName_v1');
      if(byName) item = list.find(x => x.name === byName);
    }
    return item || list[0];
  }
  function makeSnapshot(item){
    const m = item || getActive();
    return {
      priceMasterId:(m && m.id) || 'standard',
      priceMasterName:(m && m.name) || '標準',
      priceSnapshot:clone((m && m.prices) || {})
    };
  }
  function getSnapshot(){ return makeSnapshot(getActive()); }
  function getSnapshotFor(masterId){
    const list = ensureMasters();
    const item = list.find(x => x.id === masterId) || getActive();
    return makeSnapshot(item);
  }

  function patchSaveFunctions(){
    const MS = window.MS;
    if(!MS || MS.__priceMasterSavePatched) return;
    MS.__priceMasterSavePatched = true;

    const attach = function(data){
      if(!data || typeof data !== 'object') data = {};
      const snap = getSnapshot();
      data.priceMasterId = data.priceMasterId || snap.priceMasterId;
      data.priceMasterName = data.priceMasterName || snap.priceMasterName;
      data.priceSnapshot = data.priceSnapshot || snap.priceSnapshot;
      data.prices = Object.assign({}, snap.priceSnapshot, data.prices || normalizePrices(data.values || {}));
      if(data.data && typeof data.data === 'object'){
        data.data.priceMasterId = data.data.priceMasterId || snap.priceMasterId;
        data.data.priceMasterName = data.data.priceMasterName || snap.priceMasterName;
        data.data.priceSnapshot = data.data.priceSnapshot || snap.priceSnapshot;
      }
      return data;
    };

    if(typeof MS.saveEstimate === 'function'){
      const original = MS.saveEstimate;
      MS.saveEstimate = function(appType, name, data){
        if(arguments.length === 2 && name && typeof name === 'object') return original.call(this, appType, attach(name));
        return original.call(this, appType, name, attach(data));
      };
    }
    if(MS.Estimate && typeof MS.Estimate.save === 'function'){
      const originalEstimateSave = MS.Estimate.save;
      MS.Estimate.save = function(appType, data){ return originalEstimateSave.call(this, appType, attach(data)); };
    }
  }

  window.MSPriceMaster = {
    PRICE_KEYS,
    ensureMasters,
    list: ensureMasters,
    saveAll: saveMasters,
    getActive,
    activeId,
    setActive,
    getSnapshot,
    getSnapshotFor,
    makeSnapshot,
    collectFields,
    applyFields,
    normalizePrices,
    create: function(name, prices){
      const list = ensureMasters();
      const item = { id:id('pm'), name:name || '新規単価', prices:normalizePrices(prices || legacyPrices()), createdAt:now(), updatedAt:now(), memo:'' };
      list.push(item); saveMasters(list); setActive(item.id); return item;
    },
    update: function(item){
      const list = ensureMasters();
      const i = list.findIndex(x => x.id === item.id);
      const next = Object.assign({}, item, { prices:normalizePrices(item.prices || {}), updatedAt:now() });
      if(i >= 0) list[i] = Object.assign({}, list[i], next); else list.push(next);
      saveMasters(list); return next;
    },
    remove: function(targetId){
      let list = ensureMasters();
      if(list.length <= 1){ alert('最後の単価マスターは削除できません。'); return false; }
      list = list.filter(x => x.id !== targetId);
      saveMasters(list);
      if(activeId() === targetId) setActive((list[0] || {}).id || 'standard');
      return true;
    }
  };

  patchSaveFunctions();
  document.addEventListener('DOMContentLoaded', patchSaveFunctions);
  window.addEventListener('load', patchSaveFunctions);
})(window, document);


/*
============================================================
 MS積算システム 汎用アプリ追加アダプター Ver.1.0

 目的：
 - 今後アプリを増やす時に ms_common.js を書き換えない
 - 新アプリ側で APP_TYPE / priceIds / fieldIds だけ指定すれば、
   共通単価・積算保存・読込・削除を共通化できる

 使い方（新アプリ側に追加）：
 MS.AppAdapter.init({
   appType: 'new_app_id',
   defaultName: '新規積算',
   priceIds: ['Pexc','Pbed','Pstone'],
   fieldIds: ['projectName','estimateName','L','Pexc','Pbed','Pstone'],
   calc: calc,
   applyValues: function(values){ ...省略可... },
   collectValues: function(){ ...省略可... }
 });
============================================================
*/
(function(window, document){
  'use strict';

  const MS = window.MS || (window.MS = {});

  function byId(id){ return document.getElementById(id); }
  function txt(v){ return v === undefined || v === null ? '' : String(v); }
  function clone(obj){ try{ return JSON.parse(JSON.stringify(obj || {})); }catch(e){ return obj || {}; } }
  function ensureArray(v){ return Array.isArray(v) ? v : []; }
  function hasFn(fn){ return typeof fn === 'function'; }
  function safeAlert(message){ try{ alert(message); }catch(e){ console.log(message); } }
  function safeConfirm(message){ try{ return confirm(message); }catch(e){ return true; } }
  function safePrompt(message, value){ try{ return prompt(message, value || ''); }catch(e){ return value || ''; } }

  function collectByIds(ids){
    const values = {};
    ensureArray(ids).forEach(function(id){
      const el = byId(id);
      if(el) values[id] = el.value;
    });
    return values;
  }

  function applyByIds(values){
    values = values || {};
    Object.keys(values).forEach(function(id){
      const el = byId(id);
      if(el) el.value = values[id];
    });
  }

  function parseAmountText(id){
    const el = byId(id);
    if(!el) return 0;
    const raw = (el.innerText || el.textContent || el.value || '').replace(/[^0-9.\-]/g, '');
    const n = Number(raw);
    return isFinite(n) ? n : 0;
  }

  function getPriceMaster(){
    return window.MSPriceMaster || MS.PriceMaster || null;
  }

  function initCommonPricePanel(opt){
    const PM = getPriceMaster();
    if(!PM) return false;
    PM.ensureMasters();

    const prefix = opt.prefix || (opt.appType || 'app').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'app';
    const ids = {
      block: opt.priceBlockId || '',
      oldSelect: opt.savedPriceListId || 'savedPriceList',
      select: prefix + 'CommonPriceList',
      apply: prefix + 'ApplyCommonPriceBtn',
      save: prefix + 'SaveToCommonPriceBtn',
      saveAs: prefix + 'SaveAsCommonPriceBtn',
      rename: prefix + 'RenameCommonPriceBtn',
      del: prefix + 'DeleteCommonPriceBtn',
      note: prefix + 'CommonPriceNote'
    };

    let block = ids.block ? byId(ids.block) : null;
    if(!block){
      const old = byId(ids.oldSelect);
      block = old ? old.closest('.price-block') : null;
    }
    if(!block || block.dataset.msGenericCommonPrice === '1') return false;
    block.dataset.msGenericCommonPrice = '1';

    block.innerHTML =
      '<div class="sectionTitle">共通単価マスター</div>' +
      '<div class="save-line"><label>使用する単価</label><select id="'+ids.select+'"></select></div>' +
      '<div class="save-btns" style="grid-template-columns:80px 80px 1fr;align-items:center">' +
        '<button class="ghost" id="'+ids.apply+'" type="button" style="width:80px!important;min-width:80px!important">呼出</button>' +
        '<button class="primary" id="'+ids.save+'" type="button" style="width:80px!important;min-width:80px!important">保存</button>' +
        '<button class="ghost" id="'+ids.saveAs+'" type="button">名前を付けて保存</button>' +
        '<button class="ghost" id="'+ids.rename+'" type="button">名前変更</button>' +
        '<button class="danger" id="'+ids.del+'" type="button">削除</button>' +
      '</div>' +
      '<div class="note" id="'+ids.note+'">保存＝選択中の単価を上書き。名前を付けて保存＝新しい単価セットを追加します。</div>';

    const collectPrices = opt.collectPrices || function(){ return PM.collectFields(); };
    const applyPrices = opt.applyPrices || function(prices){ PM.applyFields(prices || {}); if(hasFn(opt.calc)) opt.calc(); };

    function render(){
      const sel = byId(ids.select);
      if(!sel) return;
      const current = sel.value || PM.activeId();
      sel.innerHTML = PM.list().map(function(x){ return '<option value="'+x.id+'">'+x.name+'</option>'; }).join('');
      sel.value = current;
      if(!sel.value) sel.value = PM.activeId();
      const note = byId(ids.note);
      const m = PM.getActive();
      if(note) note.textContent = '現在使用中：' + ((m && m.name) || '標準') + '（積算保存時に単価も固定保存します）';
    }

    const sel = byId(ids.select);
    render();

    if(sel){
      sel.addEventListener('change', function(){
        const item = PM.list().find(function(x){ return x.id === sel.value; });
        const note = byId(ids.note);
        if(note && item) note.textContent = '選択中：' + (item.name || '単価') + '　※まだ読み込んでいません。「呼出」を押すと使用中単価として確定します。';
      });
    }

    const applyBtn = byId(ids.apply);
    if(applyBtn) applyBtn.addEventListener('click', function(){
      const item = PM.list().find(function(x){ return x.id === (sel && sel.value); }) || PM.getActive();
      if(item){ PM.setActive(item.id); applyPrices(item.prices || {}); }
      render();
      safeAlert('共通単価「' + ((item && item.name) || '標準') + '」を読み込みました');
    });

    const saveBtn = byId(ids.save);
    if(saveBtn) saveBtn.addEventListener('click', function(){
      const m = PM.getActive();
      if(!m) return;
      PM.update({ id:m.id, name:m.name, prices:collectPrices() });
      PM.setActive(m.id);
      render();
      safeAlert('「' + m.name + '」へ上書き保存しました');
    });

    const saveAsBtn = byId(ids.saveAs);
    if(saveAsBtn) saveAsBtn.addEventListener('click', function(){
      const base = ((PM.getActive() || {}).name || '標準') + ' コピー';
      const name = safePrompt('新しい単価名を入力してください', base);
      if(!name) return;
      const item = PM.create(name, collectPrices());
      PM.setActive(item.id);
      render();
      if(sel) sel.value = item.id;
      safeAlert('「' + item.name + '」を新しく保存しました');
    });

    const renameBtn = byId(ids.rename);
    if(renameBtn) renameBtn.addEventListener('click', function(){
      const m = PM.getActive();
      if(!m) return;
      const name = safePrompt('新しい単価名を入力してください', m.name || '標準');
      if(!name) return;
      PM.update({ id:m.id, name:name, prices:m.prices || collectPrices() });
      PM.setActive(m.id);
      render();
      safeAlert('単価名を「' + name + '」に変更しました');
    });

    const delBtn = byId(ids.del);
    if(delBtn) delBtn.addEventListener('click', function(){
      const m = PM.getActive();
      if(!m) return;
      if(!safeConfirm('「' + (m.name || '単価') + '」を削除しますか？')) return;
      PM.remove(m.id);
      const a = PM.getActive();
      if(a) applyPrices(a.prices || {});
      render();
      safeAlert('削除しました');
    });

    window.addEventListener('ms-price-master-changed', function(){
      render();
      const a = PM.getActive();
      if(a && opt.autoApplyOnMasterChange !== false) applyPrices(a.prices || {});
    });

    return { render:render, ids:ids };
  }

  async function initApp(opt){
    opt = opt || {};
    const appType = opt.appType || 'other';
    const defaultName = opt.defaultName || '新規積算';
    const fieldIds = ensureArray(opt.fieldIds);
    const priceIds = ensureArray(opt.priceIds);
    const collectValues = opt.collectValues || function(){ return collectByIds(fieldIds); };
    const applyValues = opt.applyValues || function(values){ applyByIds(values || {}); };
    const collectPrices = opt.collectPrices || function(){ return collectByIds(priceIds); };
    const applyPrices = opt.applyPrices || function(prices){ applyByIds(prices || {}); if(hasFn(opt.calc)) opt.calc(); };

    if(MS.init) await MS.init();

    const PM = getPriceMaster();
    if(PM){
      PM.ensureMasters();
      initCommonPricePanel(Object.assign({}, opt, { collectPrices:collectPrices, applyPrices:applyPrices }));
      const active = PM.getActive();
      if(active && active.prices) applyPrices(active.prices);
    }

    if(MS.Project && MS.Project.getCurrent && byId(opt.projectNameId || 'projectName')){
      try{
        const p = await MS.Project.getCurrent();
        if(p) byId(opt.projectNameId || 'projectName').value = p.name || '';
      }catch(e){}
    }

    async function ensureProject(){
      if(!(MS.Project && MS.Project.create && MS.Project.getCurrent)) return null;
      let p = await MS.Project.getCurrent();
      const name = txt((byId(opt.projectNameId || 'projectName') || {}).value).trim() || '未名称工事';
      if(!p || p.name !== name){
        if(MS.Project.listActive){
          const same = (await MS.Project.listActive()).find(function(x){ return x.name === name; });
          if(same){ if(MS.setCurrentProjectId) MS.setCurrentProjectId(same.id); return same; }
        }
        p = await MS.Project.create({ name:name });
      }
      return p;
    }

    async function refreshEstimateList(selectedId){
      const sel = byId(opt.estimateSelectId || 'savedEstimateList');
      if(!sel || !(MS.Estimate && MS.Estimate.listByProjectAndApp)) return;
      const p = await ensureProject();
      const list = p ? await MS.Estimate.listByProjectAndApp(p.id, appType) : [];
      sel.innerHTML = '';
      if(!list.length){ sel.innerHTML = '<option value="">保存データなし</option>'; return; }
      list.forEach(function(item){
        const o = document.createElement('option');
        o.value = item.id;
        o.textContent = item.name || defaultName;
        sel.appendChild(o);
      });
      if(selectedId) sel.value = selectedId;
    }

    async function saveEstimate(){
      await ensureProject();
      if(hasFn(opt.calc)) opt.calc();
      const sel = byId(opt.estimateSelectId || 'savedEstimateList');
      const name = txt((byId(opt.estimateNameId || 'estimateName') || {}).value).trim() || defaultName;
      const values = collectValues();
      const priceInfo = PM ? PM.getSnapshot() : {};
      const amount = hasFn(opt.getAmount) ? opt.getAmount() : (parseAmountText(opt.totalAmountId || 'a_total') || parseAmountText('k_total'));
      const payload = {
        id: sel && sel.value ? sel.value : undefined,
        name:name,
        data:{ values:values, priceMasterId:priceInfo.priceMasterId, priceMasterName:priceInfo.priceMasterName, priceSnapshot:priceInfo.priceSnapshot },
        values:values,
        prices:clone(priceInfo.priceSnapshot || collectPrices()),
        priceMasterId:priceInfo.priceMasterId,
        priceMasterName:priceInfo.priceMasterName,
        priceSnapshot:priceInfo.priceSnapshot,
        amount:amount,
        totalAmount:amount
      };
      const saved = MS.Estimate && MS.Estimate.save ? await MS.Estimate.save(appType, payload) : await MS.saveEstimate(appType, name, payload);
      await refreshEstimateList(saved && saved.id);
      safeAlert('積算データを保存しました');
      return saved;
    }

    function applyPriceForEstimate(item){
      if(!PM || !item) return;
      const snapshot = item.priceSnapshot || (item.data && item.data.priceSnapshot) || null;
      const active = PM.getActive();
      const prices = snapshot || (active && active.prices) || {};
      applyPrices(prices);
      const noteId = opt.noteId || '';
      const note = noteId ? byId(noteId) : null;
      if(note){
        note.textContent = snapshot
          ? '保存時単価を復元：' + (item.priceMasterName || (item.data && item.data.priceMasterName) || '保存時単価')
          : '現在使用中：' + ((active && active.name) || '標準') + '（既存データのため、使用中単価を反映）';
      }
    }

    async function loadEstimate(){
      const sel = byId(opt.estimateSelectId || 'savedEstimateList');
      if(!sel || !sel.value || !(MS.Estimate && MS.Estimate.get)) return null;
      const item = await MS.Estimate.get(sel.value);
      if(!item) return null;
      if(byId(opt.estimateNameId || 'estimateName')) byId(opt.estimateNameId || 'estimateName').value = item.name || '';
      applyValues(item.values || (item.data && item.data.values) || {});
      applyPriceForEstimate(item);
      if(hasFn(opt.calc)) opt.calc();
      return item;
    }

    async function deleteEstimate(){
      const sel = byId(opt.estimateSelectId || 'savedEstimateList');
      if(!sel || !sel.value || !(MS.Estimate && MS.Estimate.delete)) return false;
      if(!safeConfirm('選択中の積算データを削除しますか？')) return false;
      await MS.Estimate.delete(sel.value);
      await refreshEstimateList();
      return true;
    }

    function bindButton(id, handler){
      const el = byId(id);
      if(el && !el.dataset.msGenericBound){
        el.dataset.msGenericBound = '1';
        el.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); handler(); }, true);
      }
    }

    bindButton(opt.saveEstimateBtnId || 'saveEstimateBtn', saveEstimate);
    bindButton(opt.loadEstimateBtnId || 'loadEstimateBtn', loadEstimate);
    bindButton(opt.deleteEstimateBtnId || 'deleteEstimateBtn', deleteEstimate);

    const projectEl = byId(opt.projectNameId || 'projectName');
    if(projectEl){
      projectEl.addEventListener('change', function(){ ensureProject().then(function(){ return refreshEstimateList(); }).catch(function(e){ console.warn(e); }); });
    }

    await refreshEstimateList();

    const openId = localStorage.getItem('ms_open_estimate_id');
    if(openId && MS.Estimate && MS.Estimate.get){
      const item = await MS.Estimate.get(openId);
      if(item && item.appType === appType){
        localStorage.removeItem('ms_open_estimate_id');
        if(byId(opt.estimateNameId || 'estimateName')) byId(opt.estimateNameId || 'estimateName').value = item.name || '';
        applyValues(item.values || (item.data && item.data.values) || {});
        applyPriceForEstimate(item);
        await refreshEstimateList(item.id);
        if(hasFn(opt.calc)) opt.calc();
      }
    }

    return {
      appType:appType,
      refreshEstimateList:refreshEstimateList,
      saveEstimate:saveEstimate,
      loadEstimate:loadEstimate,
      deleteEstimate:deleteEstimate,
      applyPriceForEstimate:applyPriceForEstimate
    };
  }

  MS.AppAdapter = {
    init:initApp,
    initCommonPricePanel:initCommonPricePanel,
    collectByIds:collectByIds,
    applyByIds:applyByIds
  };

  window.MSAppAdapter = MS.AppAdapter;
})(window, document);


/*
============================================================
 [LEGACY / 互換専用] MS積算システム 製品単価マスター Ver.1.0
 - 全アプリ共通の製品・施工単価データベース
 - カテゴリ／メーカー／製品名検索
 - CSV入出力
 - 選択時に単価スナップショットを各アプリへ渡す
============================================================
*/
(function(window, document){
  "use strict";

  const MS = window.MS;
  if(!MS) return;

  const STORE = MS.CONFIG && MS.CONFIG.stores && MS.CONFIG.stores.productMasters;
  if(!STORE) return;

  function text(value){
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function number(value){
    if(value === "" || value === undefined || value === null) return 0;
    const n = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function clone(value){
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(error){ return value; }
  }

  function normalizeCategory(value){
    const v = text(value);
    const aliases = {
      "U型側溝":"u_gutter",
      "Ｕ型側溝":"u_gutter",
      "u":"u_gutter",
      "L型擁壁":"l_wall",
      "Ｌ型擁壁":"l_wall",
      "プレキャスト擁壁":"precast_l_wall",
      "プレキャストL型擁壁":"precast_l_wall",
      "プレキャストＬ型擁壁":"precast_l_wall",
      "可変側溝":"variable_gutter",
      "現場打U型側溝":"genbau_u_gutter",
      "現場打Ｕ型側溝":"genbau_u_gutter",
      "現場打排水桝":"genbau_drainage_pit",
      "暗渠・カルバート工":"ankyo_culvert",
      "暗渠カルバート工":"ankyo_culvert",
      "プレキャスト集水桝":"precast_drainage_basin",
      "プレキャスト排水桝":"precast_drainage_basin",
      "排水管":"drainage_pipe",
      "排水管工":"drainage_pipe",
      "配水管工":"drainage_pipe",
      "縁石":"curb",
      "縁石工":"curb",
      "歩車道ブロック":"pedestrian_vehicle_boundary_block",
      "歩車道ブロック工":"pedestrian_vehicle_boundary_block",
      "歩車道境界ブロック":"pedestrian_vehicle_boundary_block",
      "L型側溝":"l_gutter",
      "L型側溝工":"l_gutter",
      "Ｌ型側溝":"l_gutter",
      "Ｌ型側溝工":"l_gutter",
      "重力式擁壁":"gravity_wall",
      "間知ブロック":"kenchi_block",
      "間知ブロック積み":"kenchi_block",
      "間知ブロック積工":"kenchi_block",
      "防火水槽":"fire_tank",
      "防火水槽工":"fire_tank"
    };
    return aliases[v] || v;
  }

  function normalize(input, existing){
    const src = input || {};
    const old = existing || {};
    const now = MS.now ? MS.now() : new Date().toISOString();
    const unitLength = number(src.unitLength !== undefined ? src.unitLength : old.unitLength);
    const productPrice = number(src.productPrice !== undefined ? src.productPrice : old.productPrice);

    return {
      id: text(src.id || old.id) || (MS.createId ? MS.createId("product") : "product_" + Date.now()),
      category: normalizeCategory(src.category !== undefined ? src.category : old.category),
      manufacturer: text(src.manufacturer !== undefined ? src.manufacturer : old.manufacturer),
      productName: text(src.productName !== undefined ? src.productName : old.productName),
      specification: text(src.specification !== undefined ? src.specification : old.specification),
      modelCode: text(src.modelCode !== undefined ? src.modelCode : old.modelCode),

      productPrice: productPrice,
      productUnit: text(src.productUnit !== undefined ? src.productUnit : old.productUnit) || "本",
      unitLength: unitLength,
      productPricePerMeter: unitLength > 0 ? productPrice / unitLength : number(src.productPricePerMeter !== undefined ? src.productPricePerMeter : old.productPricePerMeter),

      installationPrice: number(src.installationPrice !== undefined ? src.installationPrice : old.installationPrice),
      installationUnit: text(src.installationUnit !== undefined ? src.installationUnit : old.installationUnit) || "m",

      socketPrice: number(src.socketPrice !== undefined ? src.socketPrice : old.socketPrice),
      socketUnit: text(src.socketUnit !== undefined ? src.socketUnit : old.socketUnit) || "個",

      concreteCoverPrice: number(src.concreteCoverPrice !== undefined ? src.concreteCoverPrice : old.concreteCoverPrice),
      concreteCoverUnit: text(src.concreteCoverUnit !== undefined ? src.concreteCoverUnit : old.concreteCoverUnit) || "枚",
      concreteCoverLength: number(src.concreteCoverLength !== undefined ? src.concreteCoverLength : old.concreteCoverLength),

      gratingCoverPrice: number(src.gratingCoverPrice !== undefined ? src.gratingCoverPrice : old.gratingCoverPrice),
      gratingCoverUnit: text(src.gratingCoverUnit !== undefined ? src.gratingCoverUnit : old.gratingCoverUnit) || "枚",
      gratingCoverLength: number(src.gratingCoverLength !== undefined ? src.gratingCoverLength : old.gratingCoverLength),

      coverInstallationPrice: number(src.coverInstallationPrice !== undefined ? src.coverInstallationPrice : old.coverInstallationPrice),
      coverInstallationUnit: text(src.coverInstallationUnit !== undefined ? src.coverInstallationUnit : old.coverInstallationUnit) || "枚",

      transportPrice: number(src.transportPrice !== undefined ? src.transportPrice : old.transportPrice),
      lossRate: number(src.lossRate !== undefined ? src.lossRate : old.lossRate),

      // 製品固有寸法（アプリごとの記号を柔軟に保持）
      // 例：プレキャストL型擁壁 {H1,H2,W1,W2,W3,H5}
      dimensions: clone(src.dimensions !== undefined ? src.dimensions : (old.dimensions || {})),

      // 間知ブロック製品専用（他カテゴリでは未使用のまま保持）
      blockFaceWidth: number(src.blockFaceWidth !== undefined ? src.blockFaceWidth : old.blockFaceWidth),
      blockFaceHeight: number(src.blockFaceHeight !== undefined ? src.blockFaceHeight : old.blockFaceHeight),
      blockDepth: number(src.blockDepth !== undefined ? src.blockDepth : old.blockDepth),
      blockUsePerM2: number(src.blockUsePerM2 !== undefined ? src.blockUsePerM2 : old.blockUsePerM2),

      note: text(src.note !== undefined ? src.note : old.note),
      enabled: src.enabled === undefined ? (old.enabled === undefined ? true : !!old.enabled) : !!src.enabled,
      registeredDate: text(
        old.registeredDate ||
        src.registeredDate ||
        (old.createdAt ? String(old.createdAt).slice(0, 10) : "") ||
        (src.createdAt ? String(src.createdAt).slice(0, 10) : "") ||
        (MS.today ? MS.today() : now.slice(0, 10))
      ),
      updatedDate: MS.today ? MS.today() : now.slice(0, 10),
      createdAt: old.createdAt || src.createdAt || now,
      updatedAt: now
    };
  }

  function sortRows(rows){
    return rows.sort(function(a, b){
      return (a.category || "").localeCompare(b.category || "", "ja") ||
             (a.manufacturer || "").localeCompare(b.manufacturer || "", "ja") ||
             (a.productName || "").localeCompare(b.productName || "", "ja", {numeric:true}) ||
             (a.specification || "").localeCompare(b.specification || "", "ja", {numeric:true});
    });
  }

  MS.ProductMaster = MS.ProductMaster || {};
  MS.ProductMaster.CATEGORIES = {
    gravity_wall: "重力式擁壁",
    u_gutter: "U型側溝",
    variable_gutter: "可変側溝",
    l_gutter: "L型側溝工",
    roadside_boundary_block: "地先境界ブロック",
    pedestrian_vehicle_boundary_block: "歩車道境界ブロック",
    curb: "縁石工",
    pedestrian_vehicle_boundary_block: "歩車道ブロック工",
    genbau_u_gutter: "現場打U型側溝",
    genbau_u_cover: "現場打U型側溝蓋",
    l_wall: "L型擁壁",
    precast_l_wall: "プレキャストL型擁壁",
    genbau_drainage_pit: "現場打排水桝",
    kenchi_block: "間知ブロック",
    fire_tank: "防火水槽工",
    decorative_block: "化粧ブロック",
    concrete_block: "普通ブロック",
    interlocking: "インターロッキング",
    culvert: "暗渠",
    ankyo_culvert: "暗渠・カルバート工",
    drainage_pipe: "排水管工",
    precast_drainage_basin: "プレキャスト排水桝",
    box_culvert: "ボックスカルバート",
    catch_basin: "集水桝",
    concrete_cover: "コンクリート蓋",
    grating_cover: "グレーチング蓋",
    other: "その他"
  };

  MS.ProductMaster.normalize = normalize;

  MS.ProductMaster.save = async function(input){
    await MS.init();
    const id = input && input.id ? text(input.id) : "";
    const existing = id ? await MS.DB.get(STORE, id) : null;
    const row = normalize(input, existing);
    if(!row.category) throw new MS.Error("製品カテゴリを入力してください。");
    if(!row.productName) throw new MS.Error("製品名を入力してください。");
    await MS.DB.put(STORE, row);
    return clone(row);
  };

  MS.ProductMaster.get = async function(id){
    await MS.init();
    const row = await MS.DB.get(STORE, id);
    return row ? clone(row) : null;
  };

  MS.ProductMaster.list = async function(options){
    await MS.init();
    const opt = options || {};
    const category = normalizeCategory(opt.category || "");
    const manufacturer = text(opt.manufacturer).toLowerCase();
    const keyword = text(opt.keyword).toLowerCase();
    const includeDisabled = !!opt.includeDisabled;
    let rows = await MS.DB.getAll(STORE);

    rows = rows.filter(function(row){
      if(!includeDisabled && row.enabled === false) return false;
      if(category && row.category !== category) return false;
      if(manufacturer && text(row.manufacturer).toLowerCase() !== manufacturer) return false;
      if(keyword){
        const haystack = [row.manufacturer, row.productName, row.specification, row.modelCode, row.note]
          .map(text).join(" ").toLowerCase();
        if(haystack.indexOf(keyword) === -1) return false;
      }
      return true;
    });

    return clone(sortRows(rows));
  };

  MS.ProductMaster.search = MS.ProductMaster.list;

  MS.ProductMaster.delete = async function(id){
    await MS.init();
    if(!id) return false;
    await MS.DB.delete(STORE, id);
    return true;
  };

  MS.ProductMaster.deleteMany = async function(ids){
    await MS.init();
    const keys = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
    if(keys.length === 0) return 0;
    await MS.DB.deleteMany(STORE, keys);
    return keys.length;
  };

  MS.ProductMaster.duplicate = async function(id, newName){
    const original = await MS.ProductMaster.get(id);
    if(!original) throw new MS.Error("複製する製品が見つかりません。");
    delete original.id;
    delete original.createdAt;
    delete original.updatedAt;
    delete original.registeredDate;
    delete original.updatedDate;
    original.productName = text(newName) || (original.productName + "（複製）");
    return MS.ProductMaster.save(original);
  };

  MS.ProductMaster.getManufacturers = async function(category){
    const rows = await MS.ProductMaster.list({category:category, includeDisabled:true});
    const seen = {};
    return rows.map(function(row){ return text(row.manufacturer); })
      .filter(function(name){
        if(!name || seen[name]) return false;
        seen[name] = true;
        return true;
      }).sort(function(a,b){ return a.localeCompare(b, "ja"); });
  };

  MS.ProductMaster.snapshot = function(row){
    if(!row) return null;
    return clone(normalize(row, row));
  };

  MS.ProductMaster.toAppValues = function(row, appType){
    if(!row) return {};
    const item = normalize(row, row);
    const type = normalizeCategory(appType || item.category);
    const common = {
      productMasterId: item.id,
      productMasterUpdatedAt: item.updatedAt,
      productMasterRegisteredDate: item.registeredDate,
      productMasterUpdatedDate: item.updatedDate,
      productName: item.productName,
      productManufacturer: item.manufacturer,
      productSpecification: item.specification,
      productUnitLength: item.unitLength,
      productPrice: item.productPrice,
      productPricePerMeter: item.productPricePerMeter,
      installationPrice: item.installationPrice,
      socketPrice: item.socketPrice,
      socketUnit: item.socketUnit,
      productDimensions: clone(item.dimensions || {}),
      productMasterSnapshot: clone(item)
    };
    if(type === "kenchi_block"){
      common.blockFaceWidth = item.blockFaceWidth;
      common.blockFaceHeight = item.blockFaceHeight;
      common.blockDepth = item.blockDepth;
      common.blockUsePerM2 = item.blockUsePerM2;
    }
    if(type === "u_gutter" || type === "variable_gutter" || type === "precast_drainage_basin" || type === "genbau_drainage_pit"){
      common.concreteCoverPrice = item.concreteCoverPrice;
      common.concreteCoverLength = item.concreteCoverLength;
      common.gratingCoverPrice = item.gratingCoverPrice;
      common.gratingCoverLength = item.gratingCoverLength;
      common.coverInstallationPrice = item.coverInstallationPrice;
    }
    return common;
  };


  /*
  ------------------------------------------------------------
   各積算アプリから製品マスターへ登録
  ------------------------------------------------------------
  */
  MS.ProductMaster.findDuplicate = async function(input){
    const src = input || {};
    const category = normalizeCategory(src.category || "");
    const manufacturer = text(src.manufacturer).toLowerCase();
    const productName = text(src.productName).toLowerCase();
    const specification = text(src.specification).toLowerCase();
    const modelCode = text(src.modelCode).toLowerCase();

    if(!category || !productName) return null;

    const rows = await MS.ProductMaster.list({
      category: category,
      includeDisabled: true
    });

    const hit = rows.find(function(row){
      if(text(row.productName).toLowerCase() !== productName) return false;
      if(manufacturer && text(row.manufacturer).toLowerCase() !== manufacturer) return false;
      if(specification && text(row.specification).toLowerCase() !== specification) return false;
      if(modelCode && text(row.modelCode).toLowerCase() !== modelCode) return false;
      return true;
    });

    return hit ? clone(hit) : null;
  };

  MS.ProductMaster.saveFromApp = async function(input, options){
    const src = Object.assign({}, input || {});
    const opt = options || {};

    if(!text(src.category)){
      throw new MS.Error("製品カテゴリを指定してください。");
    }
    if(!text(src.productName)){
      throw new MS.Error("製品名を入力してください。");
    }

    let duplicate = null;
    if(!src.id){
      duplicate = await MS.ProductMaster.findDuplicate(src);
    }

    if(duplicate && !opt.overwrite){
      return {
        saved: false,
        duplicate: duplicate,
        row: null
      };
    }

    if(duplicate && opt.overwrite){
      src.id = duplicate.id;
    }

    const row = await MS.ProductMaster.save(src);
    return {
      saved: true,
      duplicate: duplicate,
      row: row
    };
  };

  function csvEscape(value){
    const s = value === undefined || value === null ? "" : String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function parseCSV(textValue){
    const text = String(textValue || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [], cell = "", quoted = false;
    for(let i=0; i<text.length; i++){
      const ch = text[i];
      if(quoted){
        if(ch === '"' && text[i+1] === '"'){ cell += '"'; i++; }
        else if(ch === '"'){ quoted = false; }
        else cell += ch;
      }else{
        if(ch === '"') quoted = true;
        else if(ch === ','){ row.push(cell); cell = ""; }
        else if(ch === '\n'){ row.push(cell.replace(/\r$/, "")); rows.push(row); row=[]; cell=""; }
        else cell += ch;
      }
    }
    if(cell !== "" || row.length){ row.push(cell.replace(/\r$/, "")); rows.push(row); }
    return rows;
  }

  MS.ProductMaster.CSV_FIELDS = [
    "id","category","manufacturer","productName","specification","modelCode",
    "productPrice","productUnit","unitLength","productPricePerMeter",
    "dimension_H1","dimension_H2","dimension_W1","dimension_W2","dimension_W3","dimension_H5",
    "installationPrice","installationUnit","socketPrice","socketUnit",
    "concreteCoverPrice","concreteCoverUnit","concreteCoverLength",
    "gratingCoverPrice","gratingCoverUnit","gratingCoverLength",
    "coverInstallationPrice","coverInstallationUnit",
    "transportPrice","lossRate","note","enabled","registeredDate","updatedDate","createdAt","updatedAt"
  ];

  MS.ProductMaster.exportCSV = async function(options){
    const rows = await MS.ProductMaster.list(Object.assign({}, options || {}, {includeDisabled:true}));
    const fields = MS.ProductMaster.CSV_FIELDS;
    return "\uFEFF" + [fields.join(",")].concat(rows.map(function(row){
      return fields.map(function(field){
        if(field.indexOf("dimension_") === 0){
          const key=field.slice("dimension_".length);
          return csvEscape(row.dimensions && row.dimensions[key] !== undefined ? row.dimensions[key] : "");
        }
        return csvEscape(row[field]);
      }).join(",");
    })).join("\r\n");
  };

  MS.ProductMaster.downloadCSV = async function(options){
    const csv = await MS.ProductMaster.exportCSV(options);
    const stamp = MS.timestamp ? MS.timestamp() : Date.now();
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MS_product_master_" + stamp + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      if(a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    return true;
  };

  MS.ProductMaster.importCSV = async function(csvText, options){
    await MS.init();
    const opt = options || {};
    const table = parseCSV(csvText);
    if(table.length < 2) return {saved:0, skipped:0, errors:[]};
    const headers = table[0].map(text);
    const aliases = {
      "カテゴリ":"category", "メーカー":"manufacturer", "製品名":"productName", "規格":"specification",
      "型番":"modelCode", "製品価格":"productPrice", "製品単位":"productUnit", "1本の長さ":"unitLength",
      "ｍ単価":"productPricePerMeter", "m単価":"productPricePerMeter", "据付手間":"installationPrice",
      "据付単位":"installationUnit", "継手ソケット":"socketPrice", "継手ソケット単位":"socketUnit", "コンクリート蓋":"concreteCoverPrice", "コンクリート蓋長さ":"concreteCoverLength",
      "グレーチング蓋":"gratingCoverPrice", "グレーチング蓋長さ":"gratingCoverLength",
      "蓋設置費":"coverInstallationPrice", "備考":"note",
      "H1":"dimension_H1", "H2":"dimension_H2", "W1":"dimension_W1", "W2":"dimension_W2", "W3":"dimension_W3", "H5":"dimension_H5",
      "登録日":"registeredDate", "更新日":"updatedDate"
    };
    const keys = headers.map(function(h){ return aliases[h] || h; });
    let saved = 0, skipped = 0;
    const errors = [];

    if(opt.replace === true) await MS.DB.clear(STORE);

    for(let i=1; i<table.length; i++){
      const values = table[i];
      if(values.every(function(v){ return !text(v); })) continue;
      const raw = {};
      keys.forEach(function(key, index){ if(key) raw[key] = values[index]; });
      if(text(raw.enabled).toLowerCase() === "false" || text(raw.enabled) === "0") raw.enabled = false;
      else if(raw.enabled !== undefined) raw.enabled = true;
      try{
        if(!text(raw.category) || !text(raw.productName)){ skipped++; continue; }
        const dimKeys=["H1","H2","W1","W2","W3","H5"];
        const dims={};let hasDims=false;
        dimKeys.forEach(function(k){
          const key="dimension_"+k;
          if(raw[key] !== undefined && text(raw[key]) !== ""){ dims[k]=number(raw[key]);hasDims=true; }
          delete raw[key];
        });
        if(hasDims) raw.dimensions=dims;
        await MS.ProductMaster.save(raw);
        saved++;
      }catch(error){
        errors.push({line:i+1, message:error && error.message ? error.message : String(error)});
      }
    }
    return {saved:saved, skipped:skipped, errors:errors};
  };

  MS.ProductMaster.count = async function(){
    await MS.init();
    return MS.DB.count(STORE);
  };

})(window, document);


/*
============================================================
 MS積算システム 製品単価マスター 固定カテゴリ Ver.2.0
 - カテゴリはシステム固定
 - ユーザーによる追加・変更・削除・並び替えは行わない
 - 製品単価マスターで削除した製品は再登録しない
============================================================
*/
(function(window, document){
  "use strict";
  const MS = window.MS;
  if(!MS || !MS.ProductMaster) return;

  const DEFAULTS = [
    {id:"u_gutter", name:"U型側溝", enabled:true},
    {id:"variable_gutter", name:"可変側溝", enabled:true},
    {id:"l_gutter", name:"L型側溝工", enabled:true},
    {id:"roadside_boundary_block", name:"地先境界ブロック", enabled:true},
    {id:"pedestrian_vehicle_boundary_block", name:"歩車道境界ブロック", enabled:true},
    {id:"curb", name:"縁石工", enabled:true},
    {id:"genbau_u_gutter", name:"現場打U型側溝", enabled:true},
    {id:"genbau_u_cover", name:"現場打U型側溝蓋", enabled:true},
    {id:"l_wall", name:"L型擁壁", enabled:true},
    {id:"precast_l_wall", name:"プレキャストL型擁壁", enabled:true},
    {id:"genbau_drainage_pit", name:"現場打排水桝", enabled:true},
    {id:"kenchi_block", name:"間知ブロック", enabled:true},
    {id:"fire_tank", name:"防火水槽工", enabled:true},
    {id:"decorative_block", name:"化粧ブロック", enabled:true},
    {id:"concrete_block", name:"普通ブロック", enabled:true},
    {id:"interlocking", name:"インターロッキング", enabled:true},
    {id:"culvert", name:"暗渠", enabled:true},
    {id:"ankyo_culvert", name:"暗渠・カルバート工", enabled:true},
    {id:"drainage_pipe", name:"排水管工", enabled:true},
    {id:"precast_drainage_basin", name:"プレキャスト排水桝", enabled:true},
    {id:"box_culvert", name:"ボックスカルバート", enabled:true},
    {id:"catch_basin", name:"集水桝", enabled:true},
    {id:"concrete_cover", name:"コンクリート蓋", enabled:true},
    {id:"grating_cover", name:"グレーチング蓋", enabled:true},
    {id:"other", name:"その他", enabled:true}
  ];

  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function fixedRows(){
    return DEFAULTS.map(function(row,index){
      return {
        id:row.id,
        name:row.name,
        enabled:row.enabled !== false,
        order:index
      };
    });
  }
  function syncMap(rows){
    const map = {};
    rows.forEach(function(row){ map[row.id] = row.name; });
    MS.ProductMaster.CATEGORIES = map;
    MS.ProductMaster.CATEGORY_ROWS = clone(rows);
  }
  function fixedError(){
    throw new MS.Error("製品カテゴリはシステム固定のため変更できません。");
  }

  MS.ProductMaster.Category = MS.ProductMaster.Category || {};
  MS.ProductMaster.Category.DEFAULTS = clone(DEFAULTS);
  MS.ProductMaster.Category.ensure = async function(){
    await MS.DB.open();
    const rows = fixedRows();
    syncMap(rows);
    return clone(rows);
  };
  MS.ProductMaster.Category.list = async function(options){
    const rows = await MS.ProductMaster.Category.ensure();
    const includeDisabled = !!(options && options.includeDisabled);
    return rows.filter(function(row){ return includeDisabled || row.enabled !== false; });
  };
  MS.ProductMaster.Category.saveAll = async function(){ return MS.ProductMaster.Category.ensure(); };
  MS.ProductMaster.Category.add = async function(){ fixedError(); };
  MS.ProductMaster.Category.update = async function(){ fixedError(); };
  MS.ProductMaster.Category.move = async function(){ fixedError(); };
  MS.ProductMaster.Category.remove = async function(){ fixedError(); };
  MS.ProductMaster.Category.reset = async function(){ return MS.ProductMaster.Category.ensure(); };
  MS.ProductMaster.getCategories = function(options){
    return MS.ProductMaster.Category.list(options);
  };

  const originalInit = MS.init;
  MS.init = async function(){
    const result = await originalInit.apply(MS, arguments);
    await MS.ProductMaster.Category.ensure();
    return result;
  };

  syncMap(fixedRows());
})(window, document);


/* ===== 保存データ一覧 appType 日本語表示 最終補強 v1.2.4 =====
   内部値は英語のまま保持し、画面上の表示文字だけ日本語化する。
   index.html が appType を直接描画する場合や、後からDOMへ追加する場合にも対応。
================================================================ */
(function(window, document){
  "use strict";

  const MS = window.MS = window.MS || {};

  const APP_LABELS_JA = {
    "l_wall":"L型擁壁",
    "l_wall_sekisan":"L型擁壁",
    "lgata":"L型擁壁",

    "precast_l_wall":"プレキャストL型擁壁",
    "precast_l_wall_sekisan":"プレキャストL型擁壁",
    "precast_lgata":"プレキャストL型擁壁",

    "gravity_wall":"重力式擁壁",
    "gravity_wall_sekisan":"重力式擁壁",

    "u_gutter":"U型側溝",
    "u_gutter_sekisan":"U型側溝",
    "ugata":"U型側溝",

    "genbau_u_gutter":"現場打U型側溝",
    "genbau_u_gutter_sekisan":"現場打U型側溝",
    "genbau_ugata":"現場打U型側溝",

    "kahen_sokkou":"可変側溝",
    "variable_gutter":"可変側溝",

    "ankyo_culvert":"暗渠・カルバート工",
    "culvert":"暗渠・カルバート工",

    "drainage_pipe":"排水管工",
    "haisui_pipe":"排水管工",
    "drainage_pipe_sekisan":"排水管工",

    "precast_drainage_basin":"プレキャスト集水桝",
    "precast_shusui_masu":"プレキャスト集水桝",
    "precast_drainage_pit":"プレキャスト集水桝",

    "genbau_drainage_pit":"現場打排水桝",
    "genbau_haisui_masu":"現場打排水桝",
    "cast_in_place_drainage_pit":"現場打排水桝",

    "curb":"縁石工",
    "enshiki":"縁石工",
    "curb_sekisan":"縁石工",

    "pedestrian_vehicle_boundary_block":"歩車道ブロック工",
    "pedestrian_vehicle_block":"歩車道ブロック工",
    "hodousha_block":"歩車道ブロック工",

    "l_gutter":"L型側溝工",
    "l_gutter_sekisan":"L型側溝工",

    "mikiri_concrete":"見切コンクリート",
    "edge_concrete":"見切コンクリート",

    "block":"ブロック積",
    "block_wall":"ブロック積",
    "doma":"土間コンクリート",
    "fence":"フェンス",
    "carport":"カーポート",
    "masu":"集水桝",
    "catch_basin":"集水桝",
    "other":"その他",
    "unknown":"その他"
  };

  function normalizeKey(value){
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/\\/g, "/")
      .split("/").pop()
      .replace(/\.(html?|js)$/i, "")
      .replace(/\(\d+\)$/g, "")
      .replace(/[\s-]+/g, "_");
  }

  function getJapaneseAppLabel(value){
    const raw = String(value == null ? "" : value).trim();
    if(!raw) return "未分類";
    if(/[ぁ-んァ-ヶ一-龠々]/.test(raw)) return raw;
    const key = normalizeKey(raw);
    return APP_LABELS_JA[key] || APP_LABELS_JA[raw] || raw;
  }

  MS.APP_LABEL = Object.assign({}, MS.APP_LABEL || {}, APP_LABELS_JA);
  MS.APP_LABELS_JA = Object.assign({}, APP_LABELS_JA);
  MS.getAppLabel = getJapaneseAppLabel;

  if(MS.Estimate){
    MS.Estimate.APP_LABELS = Object.assign({}, MS.Estimate.APP_LABELS || {}, APP_LABELS_JA);
    MS.Estimate.getAppLabel = getJapaneseAppLabel;
  }

  function convertText(text){
    const source = String(text == null ? "" : text);
    const trimmed = source.trim();
    if(!trimmed) return source;

    // appTypeだけが表示されている場合
    const direct = getJapaneseAppLabel(trimmed);
    if(direct !== trimmed){
      return source.replace(trimmed, direct);
    }

    // 「種類：gravity_wall」など、説明文字と一緒に表示される場合
    let result = source;
    Object.keys(APP_LABELS_JA)
      .sort(function(a,b){ return b.length-a.length; })
      .forEach(function(key){
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp("(^|[^A-Za-z0-9_])" + escaped + "(?=$|[^A-Za-z0-9_])", "gi");
        result = result.replace(re, function(all, before){
          return before + APP_LABELS_JA[key];
        });
      });
    return result;
  }

  function translateNode(root){
    if(!root) return;

    if(root.nodeType === Node.TEXT_NODE){
      const next = convertText(root.nodeValue);
      if(next !== root.nodeValue) root.nodeValue = next;
      return;
    }

    if(root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

    // optionのvalueやdata属性など内部値には触れず、表示文字だけを処理
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function(node){
      const parent = node.parentElement;
      if(parent && /^(SCRIPT|STYLE|TEXTAREA)$/i.test(parent.tagName)) return;
      const next = convertText(node.nodeValue);
      if(next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function startTranslation(){
    translateNode(document.body);

    if(!document.body || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        if(m.type === "characterData"){
          translateNode(m.target);
        }else{
          m.addedNodes.forEach(function(node){ translateNode(node); });
        }
      });
    });
    observer.observe(document.body, {
      childList:true,
      subtree:true,
      characterData:true
    });

    // 一覧描画が遅い画面への念押し
    [50, 200, 500, 1000, 2000].forEach(function(ms){
      setTimeout(function(){ translateNode(document.body); }, ms);
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", startTranslation, {once:true});
  }else{
    startTranslation();
  }

  window.addEventListener("load", function(){ translateNode(document.body); });
  window.addEventListener("ms-estimate-list-changed", function(){ translateNode(document.body); });
  window.addEventListener("ms-project-changed", function(){ translateNode(document.body); });

})(window, document);



/* ============================================================
   積算物件マスター 共通管理 Ver.1.0
   ============================================================ */
(function(window){
  "use strict";
  const MS = window.MS;
  if(!MS) return;

  MS.EstimateMaster = MS.EstimateMaster || {};
  const EM = MS.EstimateMaster;

  EM.storeName = function(){ return MS.CONFIG.stores.estimateMasters; };

  EM.normalize = function(data){
    const now = MS.now();
    const src = MS.clone(data || {});
    return {
      id: src.id || MS.createId("em"),
      appType: String(src.appType || ""),
      appLabel: String(src.appLabel || ""),
      name: String(src.name || "").trim(),
      memo: String(src.memo || "").trim(),
      meta: MS.clone(src.meta || {}),
      values: MS.clone(src.values || {}),
      createdAt: src.createdAt || now,
      updatedAt: src.updatedAt || now
    };
  };

  EM.save = async function(data){
    await MS.init();
    const row = EM.normalize(data);
    const old = row.id ? await MS.DB.get(EM.storeName(), row.id) : null;
    if(old && old.createdAt) row.createdAt = old.createdAt;
    row.updatedAt = MS.now();
    await MS.DB.put(EM.storeName(), row);
    return row;
  };

  EM.list = async function(appType){
    await MS.init();
    let rows;
    if(appType){
      rows = await MS.DB.getAllByIndex(EM.storeName(), "appType", appType);
    }else{
      rows = await MS.DB.getAll(EM.storeName());
    }
    return MS.sortByUpdatedDesc(rows);
  };

  EM.get = async function(id){
    await MS.init();
    return MS.DB.get(EM.storeName(), id);
  };

  EM.remove = async function(id){
    await MS.init();
    return MS.DB.delete(EM.storeName(), id);
  };

  EM.duplicate = async function(id, newName){
    const src = await EM.get(id);
    if(!src) throw new MS.Error("複製元の積算物件マスターが見つかりません。");
    const now = MS.now();
    const copy = MS.clone(src);
    copy.id = MS.createId("em");
    copy.name = String(newName || ((src.name || "名称未設定") + " コピー")).trim();
    copy.createdAt = now;
    copy.updatedAt = now;
    await MS.DB.put(EM.storeName(), copy);
    return copy;
  };

  EM.searchText = function(row){
    const m = row && row.meta ? row.meta : {};
    const v = row && row.values ? row.values : {};
    return [
      row && row.name, row && row.memo, row && row.appLabel,
      m.priceName, v.estimateName,
      /* 旧テンプレート互換検索 */ m.manufacturer, m.productName, m.specification
    ].filter(Boolean).join(" ").toLowerCase();
  };

  EM.search = async function(keyword, appType){
    const rows = await EM.list(appType);
    const words = String(keyword || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if(!words.length) return rows;
    return rows.filter(function(row){
      const s = EM.searchText(row);
      return words.every(function(w){ return s.indexOf(w) !== -1; });
    });
  };

  EM.exportRows = async function(){
    return EM.list();
  };

  EM.importRows = async function(rows){
    await MS.init();
    if(!Array.isArray(rows)) throw new MS.Error("積算物件マスターの読込形式が正しくありません。");
    const normalized = rows.map(function(row){
      const n = EM.normalize(row);
      if(!n.name) n.name = "名称未設定";
      return n;
    });
    await MS.DB.putMany(EM.storeName(), normalized);
    return normalized.length;
  };

  // U型側溝の旧試作版(localStorage)を一度だけ共通DBへ移行
  EM.migrateLegacyUGutter = async function(){
    const flag = "MS_estimate_master_migrated_u_gutter_v1";
    if(MS.Storage.getText(flag, "") === "1") return 0;
    let rows = [];
    try{
      rows = JSON.parse(window.localStorage.getItem("MS_estimate_item_master_u_gutter_v1") || "[]");
    }catch(e){ rows = []; }
    if(!Array.isArray(rows) || !rows.length){
      MS.Storage.setText(flag, "1");
      return 0;
    }
    await MS.init();
    const existing = await EM.list("u_gutter");
    const ids = new Set(existing.map(function(x){return x.id;}));
    const add = rows.filter(function(x){return x && !ids.has(x.id);}).map(function(x){
      x.appType = "u_gutter";
      x.appLabel = x.appLabel || "U型側溝";
      return EM.normalize(x);
    });
    if(add.length) await MS.DB.putMany(EM.storeName(), add);
    MS.Storage.setText(flag, "1");
    return add.length;
  };

})(window);

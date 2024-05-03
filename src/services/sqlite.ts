import {
  QuickSQLiteConnection,
  open,
  SQLBatchTuple,
} from 'react-native-quick-sqlite'
import {Proof} from '../models/Proof'
import {
  Transaction,
  TransactionRecord,
  TransactionStatus,
} from '../models/Transaction'
import {getRandomUsername} from '../utils/usernames'
import {UserSettings} from '../models/UserSettingsStore'
import AppError, {Err} from '../utils/AppError'
import {log} from './logService'
import {LogLevel} from './log/logTypes'
import {BackupProof} from '../models/Proof'
import { CashuUtils } from './cashu/cashuUtils'

let _db: QuickSQLiteConnection

const _dbVersion = 10 // Update this if db changes require migrations

const getInstance = function () {
  if (!_db) {
    // 1. creates database
    _db = _createDatabaseInstance() as QuickSQLiteConnection

    // 2. Runs possible migrations and sets version
    _createOrUpdateSchema(_db)
  }

  return _db
}

const _createDatabaseInstance = function () {
  try {
    const instance = open({name: 'minibits.db'})
    return instance as QuickSQLiteConnection
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not create or open database',
      e.message,
    )
  }
}

const _createOrUpdateSchema = function (db: QuickSQLiteConnection) {
  const creationQueries = [
    [
        `CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY NOT NULL,
        type TEXT,
        amount INTEGER,
        unit TEXT,
        fee INTEGER,
        data TEXT,
        sentFrom TEXT,
        sentTo TEXT,
        memo TEXT,
        mint TEXT,
        balanceAfter INTEGER,
        noteToSelf TEXT,
        tags TEXT,
        status TEXT,
        createdAt TEXT
    )`,
    ],    
    [
        `CREATE TABLE IF NOT EXISTS usersettings (
        id INTEGER PRIMARY KEY NOT NULL,      
        walletId TEXT,
        preferredUnit TEXT,    
        isOnboarded BOOLEAN,
        isStorageEncrypted BOOLEAN,
        isLocalBackupOn BOOLEAN,
        isTorDaemonOn BOOLEAN,
        isLoggerOn BOOLEAN,
        isStorageMigrated BOOLEAN,
        logLevel TEXT,
        createdAt TEXT      
    )`,
    ],
    [
        `CREATE TABLE IF NOT EXISTS proofs (            
        id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        secret TEXT PRIMARY KEY NOT NULL,
        C TEXT NOT NULL,
        unit TEXT,
        tId INTEGER,
        isPending BOOLEAN,
        isSpent BOOLEAN,
        updatedAt TEXT      
    )`,
    ],
    [
        `CREATE TABLE IF NOT EXISTS dbversion (
        id INTEGER PRIMARY KEY NOT NULL,
        version INTEGER,
        createdAt TEXT      
    )`,
    ],
  ] as SQLBatchTuple[]

  try {
    const {rowsAffected} = db.executeBatch(creationQueries)

    if (rowsAffected && rowsAffected > 0) {
      log.info('New database schema created')
    }

    const {version} = getDatabaseVersion()    
    log.info('[_createOrUpdateSchema]', `Device database version: ${version}`)

    // Trigger migrations if there is versions mismatch
    if (version < _dbVersion) {
      _runMigrations(db)
    }
       
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not create or update database schema',
      e.message,
    )
  }
}

// Run database migrations in case on device version of schema is not yet set or outdated

const _runMigrations = function (db: QuickSQLiteConnection) {
    const now = new Date()
    const {version} = getDatabaseVersion()    

    let currentVersion = version
    let migrationQueries: SQLBatchTuple[] = []

    // Database migrations sequence based on local version numbers
    

    if (currentVersion < 3) {
      
        const walletId = _generateWalletId()

        migrationQueries.push([
            `ALTER TABLE usersettings
            ADD COLUMN walletId TEXT`,       
        ],[
            `UPDATE usersettings
            SET walletId = ?
            WHERE id = ?`, [walletId, 1]
        ]) 

        log.info(`Prepared database migrations from ${currentVersion} -> 3`)
    }


    if (currentVersion < 4) {
        migrationQueries.push([
            `ALTER TABLE transactions
            ADD COLUMN sentTo TEXT`,       
        ]) 

        log.info(`Prepared database migrations from ${currentVersion} -> 4`)
    }


    if (currentVersion < 5) {
        migrationQueries.push([
            `ALTER TABLE transactions
            ADD COLUMN mint TEXT`,       
        ]) 

        log.info(`Prepared database migrations from ${currentVersion} -> 5`)
    }


    if (currentVersion < 6) {
        migrationQueries.push([
            `ALTER TABLE usersettings
            ADD COLUMN isTorDaemonOn BOOLEAN`,       
        ]) 

        log.info(`Prepared database migrations from ${currentVersion} -> 6`)
    }

    if (currentVersion < 7) {
        migrationQueries.push([
            `ALTER TABLE usersettings
            ADD COLUMN isLoggerOn BOOLEAN`,       
        ],[
            `ALTER TABLE usersettings
            ADD COLUMN logLevel TEXT`,       
        ]) 

        log.info(`Prepared database migrations from ${currentVersion} -> 6`)
    }

    if (currentVersion < 8) {
        migrationQueries.push([
            `ALTER TABLE usersettings
            ADD COLUMN isStorageMigrated BOOLEAN`,       
        ])

        log.info(`Prepared database migrations from ${currentVersion} -> 8`)
    }

    if (currentVersion < 9) {
      migrationQueries.push([
          `ALTER TABLE transactions
          ADD COLUMN unit TEXT`,       
      ], [
        `ALTER TABLE proofs
        ADD COLUMN unit TEXT`,
      ],[
        `ALTER TABLE usersettings
        ADD COLUMN preferredUnit TEXT`,
      ])

      log.info(`Prepared database migrations from ${currentVersion} -> 9`)
    }

    if (currentVersion < 10) {
      migrationQueries.push([
          `UPDATE transactions
          SET unit = ?`, ['sat']     
      ])

      log.info(`Prepared database migrations from ${currentVersion} -> 10`)
  }

    // Update db version as a part of migration sqls
    migrationQueries.push([
      `INSERT OR REPLACE INTO dbversion (id, version, createdAt)
      VALUES (?, ?, ?)`,
      [1, _dbVersion, now.toISOString()],
    ])

  try {
    const {rowsAffected} = db.executeBatch(migrationQueries)

    if (rowsAffected && rowsAffected > 0) {
      log.info(`Completed database migrations to version ${_dbVersion}`)
    }
  } catch (e: any) { 
    // silent    
    log.info(
      Err.DATABASE_ERROR,
      'Database migrations error: ' + e.toString(),      
    )
  }
}


const _generateWalletId = (): string => {
    try {
        /* const length = 8 // Length of the id in bytes
        const random = QuickCrypto.randomBytes(length)
        const uint8Array = new Uint8Array(random)
        const stringKey = fromByteArray(uint8Array)
        const base64Key = btoa(stringKey)*/

        const walletId = getRandomUsername()    
        log.debug('[_generateWalletId]', 'New walletId created:', walletId)
    
        return walletId
    } catch (e: any) {
        throw new AppError(Err.DATABASE_ERROR, e.message)
    }
}

/*
 * Exported functions
 */

const cleanAll = function () {
  const dropQueries = [
    ['DROP TABLE transactions'],
    ['DROP TABLE usersettings'],
    ['DROP TABLE proofs'],
    ['DROP TABLE dbversion'],
  ] as SQLBatchTuple[]

  try {
    const db = getInstance()
    const {rowsAffected} = db.executeBatch(dropQueries)

    if (rowsAffected && rowsAffected > 0) {
      log.info('[cleanAll]', 'Database tables were deleted')
    }
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not delete database schema',
      e.message,
    )
  }
}


const getDatabaseVersion = function (): {version: number} {
  try {
    const query = `
      SELECT version FROM dbVersion
    `
    const db = getInstance()
    const {rows} = db.execute(query)

    if (!rows?.item(0)) {
        // On first run, insert current version record
        const now = new Date()
        const insertQuery = `
            INSERT OR REPLACE INTO dbversion (id, version, createdAt)
            VALUES (?, ?, ?)
        `
        const params = [1, _dbVersion, now.toISOString()]
        db.execute(insertQuery, params)

        return {version: _dbVersion}      
    }

    return rows?.item(0)    
    
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not get database version',
      e.message,
    )
  }
}

/*
 * User settings
 */

const getUserSettings = function (): UserSettings {
    try {
        const query = `
        SELECT * FROM usersettings LIMIT 1
        `
        const db = getInstance()
        const {rows} = db.execute(query)

        if (!rows?.item(0)) {
            const walletId = _generateWalletId()
            const defaultSettings = updateUserSettings({
                walletId,
                preferredUnit: 'sat',                              
                isOnboarded: 0,
                isStorageEncrypted: 0,
                isLocalBackupOn: 1,
                isTorDaemonOn: 0,
                isLoggerOn: 1,
                isStorageMigrated: 0,
                logLevel: LogLevel.ERROR
            })
            log.debug('[getUserSettings]', 'Stored default user settings in the database')
            return defaultSettings
        }

        return rows.item(0)
    } catch (e: any) {
        throw new AppError(
        Err.DATABASE_ERROR,
        'Could not get user settings',
        e.message,
        )
    }
}

const updateUserSettings = function (settings: UserSettings): UserSettings {
    try {
        const now = new Date()
        const {
          walletId,
          preferredUnit,
          isOnboarded, 
          isStorageEncrypted, 
          isLocalBackupOn, 
          isTorDaemonOn, 
          isLoggerOn, 
          isStorageMigrated, 
          logLevel
        } = settings

        const query = `
        INSERT OR REPLACE INTO usersettings (id, walletId, preferredUnit, isOnboarded, isStorageEncrypted, isLocalBackupOn, isTorDaemonOn, isLoggerOn, isStorageMigrated, logLevel, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)      
        `
        const params = [
            1,
            walletId,
            preferredUnit,                        
            isOnboarded,
            isStorageEncrypted,
            isLocalBackupOn,
            isTorDaemonOn,
            isLoggerOn,            
            isStorageMigrated,          
            logLevel,
            now.toISOString(),
        ]

        const db = getInstance()
        db.execute(query, params)

        log.debug('[updateUserSettings]', 'User settings created or updated in the database', params)

        const updated = getUserSettings()
        return updated
    } catch (e: any) {
        throw new AppError(
            Err.DATABASE_ERROR,
            'Could not create or update user settings',
            e.message,
        )
    }
}


/*
 * Transactions
 */

const getTransactionsCount = function (status?: TransactionStatus) {
    let query: string = ''
    let params
    try {
        query = `
            SELECT COUNT(*) FROM transactions
        `

        if(status) {
            query = `
                SELECT COUNT(*) 
                FROM transactions
                WHERE status = ?
            `
            params = [status]
        }

        const db = getInstance()
        const {rows} = db.execute(query, params)
            
        return rows?.item(0)['COUNT(*)'] as number
    } catch (e: any) {
      throw new AppError(Err.DATABASE_ERROR, 'Transaction count error', e.message)
    }
}

const getTransactionById = function (id: number) {
  try {
    const query = `
      SELECT * FROM transactions WHERE id = ?
    `

    const params = [id]

    const db = getInstance()
    const {rows} = db.execute(query, params)

    return rows?.item(0) as TransactionRecord
  } catch (e: any) {
    throw new AppError(Err.DATABASE_ERROR, 'Transaction not found', e.message)
  }
}

const addTransactionAsync = async function (tx: Transaction) {
  try {
    const {type, amount, fee, unit, data, memo, mint, status} = tx
    const now = new Date()

    const query = `
      INSERT INTO transactions (type, amount, fee, unit, data, memo, mint, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const params = [type, amount, fee, unit, data, memo, mint, status, now.toISOString()]

    const db = getInstance()
    const result = await db.executeAsync(query, params)

    log.info('[addTransactionAsync]', 'New transaction added to the database', {type, mint, status})

    const newTx = getTransactionById(result.insertId as number)

    return newTx as TransactionRecord
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not store transaction in the database',
      e.message,
    )
  }
}

const updateStatusAsync = async function (
  id: number,
  status: TransactionStatus,
  data: string,
) {
  try {
    const query = `
      UPDATE transactions
      SET status = ?, data = ?
      WHERE id = ?      
    `
    const params = [status, data, id]

    const db = getInstance()
    await db.executeAsync(query, params)

    log.info('[updateStatusAsync]', `[${status}] Transaction status updated`, {id})

    const updatedTx = getTransactionById(id as number)

    return updatedTx as TransactionRecord
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not update transaction status in database',
      e.message,
    )
  }
}

// This updates status and appends data to the existing transaction data
const updateStatusesAsync = async function (
  transactionIds: number[],
  status: TransactionStatus,
  data: string,
) {
  const transactionIdsString = transactionIds.join(',')

  const selectQuery = `
    SELECT data
    FROM transactions
    WHERE id IN (${transactionIdsString})
  `

  try {
    const db = getInstance()
    const result1 = await db.executeAsync(selectQuery)

    if (!result1.rows) {
      return
    }

    const updatedDataArray = []

    // We prepare appended transaction data for each transaction retrieved into array
    for (const row of result1.rows?._array) {
      const currentData = row.data
      const updatedData = currentData.slice(0, -1) + ', ' + data + ']'
      updatedDataArray.push(updatedData)
    }

    const updateQuery = `
      UPDATE transactions
      SET status = ?, data = ?
      WHERE id IN (${transactionIdsString})
    `
    // We update one by one from the array
    const params = [status, updatedDataArray.join(',')]

    const result2 = await _db.executeAsync(updateQuery, params)

    log.info('[updateStatusAsync]', `[${status}] Transactions statuses updated.`, {numUpdates: result2.rowsAffected, status})

    return result2
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not update transaction statuses in the database',
      e.message,
    )
  }
}

const updateBalanceAfterAsync = async function (
  id: number,
  balanceAfter: number,
) {
  try {
    const query = `
      UPDATE transactions
      SET balanceAfter = ?
      WHERE id = ?      
    `
    const params = [balanceAfter, id]

    const db = getInstance()
    await db.executeAsync(query, params)    
    
    log.debug('[updateBalanceAfterAsync]', 'Transaction balanceAfter updated', {id, balanceAfter})

    const updatedTx = getTransactionById(id as number)

    return updatedTx as TransactionRecord
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not update transaction balanceAfter in database',
      e.message,
    )
  }
}


const updateFeeAsync = async function (id: number, fee: number) {
  try {
    const query = `
      UPDATE transactions
      SET fee = ?
      WHERE id = ?      
    `
    const params = [fee, id]

    const db = getInstance()
    await db.executeAsync(query, params)

    log.debug('[updateFeeAsync]', 'Transaction fee updated', {id, fee})

    const updatedTx = getTransactionById(id as number)

    return updatedTx as TransactionRecord
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not update transaction fee in the database',
      e.message,
    )
  }
}


const updateReceivedAmountAsync = async function (id: number, amount: number) {
  try {
    const query = `
      UPDATE transactions
      SET amount = ?
      WHERE id = ?      
    `
    const params = [amount, id]

    const db = getInstance()
    await db.executeAsync(query, params)

    log.debug('[updateReceivedAmountAsync]', 'Transaction received amount updated', {id})

    const updatedTx = getTransactionById(id as number)

    return updatedTx as TransactionRecord
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not update transaction received amount in database',
      e.message,
    )
  }
}

const updateNoteAsync = async function (id: number, note: string) {
  try {
    const query = `
      UPDATE transactions
      SET noteToSelf = ?
      WHERE id = ?      
    `
    const params = [note, id]

    const db = getInstance()
    await db.executeAsync(query, params)
    // DO NOT log to Sentry
    log.debug('[updateNoteAsync]', 'Transaction note updated')

    const updatedTx = getTransactionById(id as number)

    return updatedTx as TransactionRecord
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not update transaction note in database',
      e.message,
    )
  }
}


const updateSentFromAsync = async function (id: number, sentFrom: string) {
    try {
      const query = `
        UPDATE transactions
        SET sentFrom = ?
        WHERE id = ?      
      `
      const params = [sentFrom, id]
  
      const db = getInstance()
      await db.executeAsync(query, params)

      log.debug('[updateSentFromAsync]', 'Transaction sentFrom updated', {id, sentFrom})
  
      const updatedTx = getTransactionById(id as number)
  
      return updatedTx as TransactionRecord
    } catch (e: any) {
      throw new AppError(
        Err.DATABASE_ERROR,
        'Could not update transaction sentFrom in database',
        e.message,
      )
    }
}


const updateSentToAsync = async function (id: number, sentTo: string) {
    try {
      const query = `
        UPDATE transactions
        SET sentTo = ?
        WHERE id = ?      
      `
      const params = [sentTo, id]
  
      const db = getInstance()
      await db.executeAsync(query, params)
      
      log.debug('[updateSentToAsync]', 'Transaction sentTo updated', {id, sentTo})
  
      const updatedTx = getTransactionById(id as number)
  
      return updatedTx as TransactionRecord
    } catch (e: any) {
      throw new AppError(
        Err.DATABASE_ERROR,
        'Could not update transaction sentTo in database',
        e.message,
      )
    }
}

/* const cleanTransactionData = async function (transactionIds: number[]) {
  try {

    const transactionIdsString = transactionIds.join(',')

    const query = `
      UPDATE transactions
      SET data = ?
      WHERE id IN (${transactionIdsString})
    `
    const params = ['[]']

    const _db = getInstance()
    const result = await _db.executeAsync(query, params)

    log.info('cleanTransactionData executed in the database')

  } catch (e: any) {
    throw new AppError(Err.DATABASE_ERROR, 'Could not cleanTransactionData  in database', e.message)
  }
} */

const getTransactionsAsync = async function (limit: number, offset: number, isPending: boolean = false) {
    let query: string = ''
    try {
        query = `
        SELECT *
        FROM transactions 
        ORDER BY id DESC
        LIMIT ? OFFSET ?
        `

        if(isPending) {
            query = `
            SELECT *
            FROM transactions
            WHERE status = 'PENDING'
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            `
        }

        const params = [limit, offset]

        // log.trace(query, params)

        const db = getInstance()
        const {rows} = await db.executeAsync(query, params)

        // log.trace('Returned rows', rows?.length)
        return rows
    } catch (e: any) {
        throw new AppError(
        Err.DATABASE_ERROR,
        'Transactions could not be retrieved from the database',
        e.message,
        )
    }
}

const getPendingAmount = function () {
  try {
    const query = `
    SELECT 
    SUM(amount) 
    FROM transactions 
    WHERE status = ?
    `
    const params = [TransactionStatus.PENDING]

    const db = getInstance()
    const {rows} = db.execute(query, params)

    return rows?.item(0)['SUM(amount)']
  } catch (e: any) {
    throw new AppError(Err.DATABASE_ERROR, 'Transaction not found', e.message)
  }
}


const deleteTransactionsByStatus = async function (status: TransactionStatus) {
    try {
      const query = `
        DELETE FROM transactions
        WHERE status = ?  
      `
      const params = [status]
  
      const db = getInstance()
      const {rows} = db.execute(query, params)

      log.debug('[deleteTransactionsByStatus]', 'Transactions were deleted', {status})

      return rows

    } catch (e: any) {
      throw new AppError(
        Err.DATABASE_ERROR,
        'Could not delete transactions',
        e.message,
      )
    }
}

/*
 * Proofs - backup of store model
 */
const addOrUpdateProof = function (
  proof: Proof,
  isPending: boolean = false,
  isSpent: boolean = false,
) {
  try {
    const now = new Date()

    const query = `
      INSERT OR REPLACE INTO proofs (id, amount, secret, C, tId, isPending, isSpent, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    const params = [
      proof.id,
      proof.amount,
      proof.secret,
      proof.C,
      proof.tId,
      isPending,
      isSpent,
      now.toISOString(),
    ]

    const db = getInstance()
    const result = db.execute(query, params)
    // DO NOT log proof secrets to Sentry
    log.info('[addOrUpdateProof]', `${isPending ? ' Pending' : ''} proof added or updated in the database backup`,
      {id: result.insertId, tId: proof.tId, isPending, isSpent},
    )

    const newProof = getProofById(result.insertId as number)

    return newProof as BackupProof
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not store proof into the database',
      e.message,
    )
  }
}

const addOrUpdateProofs = function (
  proofs: Proof[],
  isPending: boolean = false,
  isSpent: boolean = false,
): number | undefined {
  try {
    const now = new Date()
    let insertQueries: SQLBatchTuple[] = []


    for (const proof of proofs) {
      insertQueries.push([
        ` INSERT OR REPLACE INTO proofs (id, amount, secret, C, unit, tId, isPending, isSpent, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          proof.id,
          proof.amount,
          proof.secret,
          proof.C,
          proof.unit,
          proof.tId,
          isPending,
          isSpent,
          now.toISOString(),
        ],
      ])
    }

    // log.trace('[addOrUpdateProofs]', {insertQueries})

    // Execute the batch of SQL statements
    const db = getInstance()
    const {rowsAffected} = db.executeBatch(insertQueries)

    const totalAmount = CashuUtils.getProofsAmount(proofs)
    // DO NOT log proof secrets to Sentry
    log.info('[addOrUpdateProofs]',
      `${rowsAffected}${isPending ? ' pending' : ''
      } proofs were added or updated in the database backup`,
      {isPending, isSpent}
    )

    return rowsAffected
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not store proofs into the database',
      e.message,
    )
  }
}

const removeAllProofs = async function () {
  try {
    const query = `
      DELETE FROM proofs
    `
    const db = getInstance()
    db.execute(query)

    log.info('[removeAllProofs]', 'All proofs were removed from the database.')

    return true
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Could not remove proofs from the database',
      e.message,
    )
  }
}

const getProofById = function (id: number) {
  try {
    const query = `
      SELECT * FROM proofs WHERE id = ?
    `
    const params = [id]

    const db = getInstance()
    const {rows} = db.execute(query, params)

    return rows?.item(0) as BackupProof
  } catch (e: any) {
    throw new AppError(Err.DATABASE_ERROR, 'proof not found', e.message)
  }
}

const getProofs = async function (
  isUnspent: boolean,
  isPending: boolean,
  isSpent: boolean,
): Promise<BackupProof[]> {
  let query: string = ''

  try {
    if (isUnspent) {
        query = `
            SELECT *
            FROM proofs
            WHERE isPending = 0
            AND isSpent = 0
            ORDER BY id DESC        
        `
    }
    if (isPending) {
        query = `
            SELECT *
            FROM proofs
            WHERE isPending = 1
            AND isSpent = 0
            ORDER BY id DESC        
        `
    }
    if (isSpent) {
        query = `
            SELECT *
            FROM proofs
            WHERE isSpent = 1
            ORDER BY id DESC        
        `
    }
    
    const db = getInstance()
    const {rows} = await db.executeAsync(query)

    return rows?._array as BackupProof[]

  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Proofs could not be retrieved from the database',
      e.message,
    )
  }
}

const getProofsByTransaction = function (transactionId: number): BackupProof[] {
  try {
    const query = `
      SELECT *
      FROM proofs 
      WHERE tId = ?      
    `
    const params = [transactionId]

    const db = getInstance()
    const {rows} = db.execute(query, params)

    return rows?._array as BackupProof[]
  } catch (e: any) {
    throw new AppError(
      Err.DATABASE_ERROR,
      'Proofs could not be retrieved from the database',
      e.message,
    )
  }
}

export const Database = {
  getInstance,
  getDatabaseVersion,
  cleanAll,
  getUserSettings,
  updateUserSettings,
  getTransactionsCount,
  getTransactionById,
  addTransactionAsync,
  updateStatusAsync,
  updateStatusesAsync,
  updateBalanceAfterAsync,
  updateFeeAsync,
  updateReceivedAmountAsync,
  updateNoteAsync,
  updateSentFromAsync,
  updateSentToAsync,
  getTransactionsAsync,
  deleteTransactionsByStatus,
  getPendingAmount,
  addOrUpdateProof,
  addOrUpdateProofs,
  removeAllProofs,
  getProofById,
  getProofs,
  getProofsByTransaction,
}

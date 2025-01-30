import {observer} from 'mobx-react-lite'
import React, {FC, useEffect, useState} from 'react'
import {Alert, TextStyle, View, ViewStyle} from 'react-native'
import {colors, spacing, useThemeColor} from '../theme'
import {SettingsStackScreenProps} from '../navigation'
import {
    APP_ENV,    
    NATIVE_VERSION_ANDROID,
    JS_BUNDLE_VERSION,
    COMMIT,
} from '@env'
import packageJson from '../../package.json'
import {  
  ListItem,
  Screen,
  Text,
  Card,
  Loading,
  ErrorModal,
  InfoModal,
  BottomModal,
  Button,
} from '../components'
import {useHeader} from '../utils/useHeader'
import {rootStoreInstance, useStores} from '../models'
import {translate} from '../i18n'
import AppError from '../utils/AppError'
import {Database, KeyChain, NostrClient, log} from '../services'
import {MMKVStorage} from '../services'
import { LogLevel } from '../services/log/logTypes'
import { getSnapshot } from 'mobx-state-tree'
import { delay } from '../utils/delay'
import RNExitApp from 'react-native-exit-app'
import { TransactionStatus } from '../models/Transaction'
import { maxTransactionsInHistory } from '../models/TransactionsStore'

// refresh

export const DeveloperScreen: FC<SettingsStackScreenProps<'Developer'>> = observer(function DeveloperScreen(_props) {
    const {navigation} = _props
    useHeader({
      leftIcon: 'faArrowLeft',
      onLeftPress: () => navigation.goBack(),
    })

    const {transactionsStore, userSettingsStore, proofsStore, walletProfileStore} = useStores()

    const [isLoading, setIsLoading] = useState(false)
    const [rnVersion, setRnVersion] = useState<string>('')
    const [walletStateSize, setWalletStateSize] = useState<number>(0)
    const [dbVersion, setDbVersion] = useState<number>(0)
    const [isLogLevelSelectorVisible, setIsLogLevelSelectorVisible] = useState<boolean>(false)
    const [selectedLogLevel, setSelectedLogLevel] = useState<LogLevel>(userSettingsStore.logLevel)
    const [error, setError] = useState<AppError | undefined>()
    const [info, setInfo] = useState('')

    useEffect(() => {
        const init = async () => {            
            const rn = packageJson.dependencies['react-native']
            const snapshot = getSnapshot(rootStoreInstance)
            // log.info('[SNAPSHOT]', {snapshot})
            const stateSize = Buffer.byteLength(JSON.stringify(snapshot), 'utf8')

            const db = Database.getInstance()
            const {version} = Database.getDatabaseVersion(db)

            setDbVersion(version)
            setWalletStateSize(stateSize)
            setRnVersion(rn)
        }
        init()
    }, [])

    // Reset of transaction model state and reload from DB
    const syncTransactionsFromDb = function () {
      setIsLoading(true)
      try {
        const result = Database.getTransactions(
          maxTransactionsInHistory,
          0,
        )

        if (result && result.length > 0) {
            // remove all from the transactionsStore model
            transactionsStore.removeAllTransactions()

            // Add last 10 to history
            transactionsStore.addToHistory(maxTransactionsInHistory, 0, false)
            // Add recent by unit
            transactionsStore.addRecentByUnit()

            setIsLoading(false)
            setInfo(translate('resetCompletedDetail', { transCount: result.length }))
            return true
        }

        setInfo(translate("resetAborted"))
        setIsLoading(false)
        return false
      } catch (e: any) {
        handleError(e)
      }
    }


    const deletePending = async function () {
      Alert.alert(
        translate("common.confirmAlertTitle"),
        "This action can not be undone. Use only in development or testing.",
        [
          {
            text: translate('common.cancel'),
            style: 'cancel',
            onPress: () => { /* Action canceled */ },
          },
          {
            text: translate('common.confirm'),
            onPress: async () => {
              try {
                setIsLoading(true)
                transactionsStore.deleteByStatus(TransactionStatus.PENDING)
        
                const pending = proofsStore.allPendingProofs
                const pendingCount = proofsStore.pendingProofsCount.valueOf()

                if(pendingCount > 0) {
                  // remove pending proofs from state and move them to spent in the db
                  proofsStore.removeProofs(pending, true, false) 
                }

                syncTransactionsFromDb()                

                setIsLoading(false)
                setInfo(`Removed pending transactions from the database and ${pendingCount} proofs from the wallet state`)
                
              } catch (e: any) {
                handleError(e)
              }
            },
          },
        ],
      )      
    }


    const movePendingToSpendable = async function () {
      Alert.alert(
        translate("common.confirmAlertTitle"),
        "This action may cause transactions failure. Use only as a recovery path agreed with support.",
        [
          {
            text: translate('common.cancel'),
            style: 'cancel',
            onPress: () => { /* Action canceled */ },
          },
          {
            text: translate('common.confirm'),
            onPress: async () => {
              try {
                setIsLoading(true)
                transactionsStore.deleteByStatus(TransactionStatus.PENDING)
        
                const pending = proofsStore.allPendingProofs
                const pendingCount = proofsStore.pendingProofsCount.valueOf()                

                if(pendingCount > 0) {
                  // force move pending proofs to spendable wallet
                  proofsStore.removeProofs(pending, true, true)
                  proofsStore.addProofs(pending)
                }                     

                setIsLoading(false)
                setInfo(`${pendingCount} pending proofs were moved to spendable balance.`)
                
              } catch (e: any) {
                handleError(e)
              }
            },
          },
        ],
      )      
    }   


    const toggleLogLevelSelector = () =>
        setIsLogLevelSelectorVisible(previousState => !previousState)


    const onLogLevelSelect = function (logLevel: LogLevel) {
        try {
            const result = userSettingsStore.setLogLevel(logLevel)
            setSelectedLogLevel(result)
        } catch (e: any) {
            handleError(e)
        }
    }
    

    const factoryReset = async function () {
      Alert.alert(
        translate("common.confirmAlertTitle"),
        translate("factoryResetUserConfirmDesc"),
        [
          {
            text: translate('common.cancel'),
            style: 'cancel',
            onPress: () => { /* Action canceled */ },
          },
          {
            text: translate('common.confirm'),
            onPress: async () => {
                setIsLoading(true)
                try {
                  // Delete database
                  Database.cleanAll()                
                  // Delete wallet keys
                  await KeyChain.removeWalletKeys()
                  // Delete auth token
                  await KeyChain.removeAuthToken()
                  // Clean mobx storage
                  MMKVStorage.clearAll()
                  // recreate db schema
                  Database.getInstance()
                  setIsLoading(false)
                  setInfo(translate("factoryResetSuccess"))
                  await delay(1000)
                  RNExitApp.exitApp()
                } catch (e: any) {
                  handleError(e)
                }
            },
          },
        ],
      )
    }

    const handleError = function (e: AppError): void {
      setIsLoading(false)
      setError(e)
    }
    
    const headerBg = useThemeColor('header')
    const iconSelectedColor = useThemeColor('button')
    const iconColor = useThemeColor('textDim')
    const headerTitle = useThemeColor('headerTitle')

    return (
      <Screen style={$screen} preset='auto'>
        <View style={[$headerContainer, {backgroundColor: headerBg}]}>
          <Text
            preset="heading"
            tx="developerScreen.title"
            style={{color: headerTitle}}
          />
        </View>
        <View style={$contentContainer}>          
          <Card
            style={[$card]}
            HeadingComponent={
                <ListItem
                  tx="developerScreen.info"
                  subText={`Environment: ${APP_ENV}
Native version: ${NATIVE_VERSION_ANDROID}
JS Bundle version: ${JS_BUNDLE_VERSION}
DB version: ${dbVersion}
State size: ${walletStateSize.toLocaleString()} bytes
React Native: ${rnVersion}
Commit: ${COMMIT}
Sentry id: ${walletProfileStore.walletId}
                  `}
                  leftIcon='faInfoCircle'
                  leftIconColor={colors.palette.iconGreen300}
                  leftIconInverse={true}                  
                  RightComponent={<View style={$rightContainer} />}
                  style={$item}
                /> 
            }
            />
          <Card
            style={[$card, {marginTop: spacing.medium}]}
            HeadingComponent={
              <>
                <ListItem
                  tx="developerScreen.logLevel"
                  subText={userSettingsStore.logLevel.toUpperCase()}
                  leftIcon='faListUl'
                  leftIconColor={colors.palette.iconMagenta200}
                  leftIconInverse={true}                  
                  style={$item}
                  bottomSeparator={true}
                  onPress={toggleLogLevelSelector}
                />
                <ListItem
                  tx="showOnboarding"
                  subTx="showOnboardingDesc"
                  leftIcon='faInfoCircle'
                  leftIconColor={colors.light.tint}
                  leftIconInverse={true}                  
                  style={$item}     
                  bottomSeparator={true}             
                  onPress={() => userSettingsStore.setIsOnboarded(false)}
                /> 
                <ListItem
                  text="Resync transactions"
                  subText="Refresh recent transactions history from database."
                  leftIcon='faRotate'
                  leftIconColor={colors.palette.blue200}
                  leftIconInverse={true}                  
                  style={$item}                  
                  onPress={syncTransactionsFromDb}
                /> 
              </>
            }
          />
          <Card
            label='Danger zone'
            labelStyle={{marginTop: spacing.medium}}
            style={[$card]}
            HeadingComponent={
              <>
                <ListItem
                  text="Force move pending"
                  subText="Move pending ecash back to spendable balance."
                  leftIcon='faArrowUp'
                  leftIconColor={colors.palette.accent200}
                  leftIconInverse={true}
                  RightComponent={<View style={$rightContainer} />}
                  style={$item}                  
                  onPress={movePendingToSpendable}
                />
                <ListItem
                  text="Force delete pending"
                  subText="Removes ecash from pending state and deletes all pending transactions."
                  leftIcon='faClock'
                  leftIconColor={colors.palette.accent400}
                  leftIconInverse={true}
                  RightComponent={<View style={$rightContainer} />}
                  style={$item}                  
                  onPress={deletePending}
                  topSeparator
                />
                <ListItem
                  tx="developerScreen.reset"
                  subTx="developerScreen.resetDescription"
                  leftIcon='faXmark'
                  leftIconColor={colors.palette.angry500}
                  leftIconInverse={true}
                  RightComponent={<View style={$rightContainer} />}
                  style={$item}                  
                  onPress={factoryReset}
                  topSeparator
                />  
              </>
            }
            />
        </View>
        <BottomModal
          isVisible={isLogLevelSelectorVisible ? true : false}
          style={{alignItems: 'stretch'}}          
          ContentComponent={
            <>
                <ListItem                    
                    text={LogLevel.ERROR.toUpperCase()}
                    subTx="loglevelErrorDesc"
                    leftIcon={selectedLogLevel === LogLevel.ERROR ? 'faCheckCircle' : 'faCircle'}          
                    leftIconColor={selectedLogLevel === LogLevel.ERROR ? iconSelectedColor as string : iconColor as string}                    
                    onPress={() => onLogLevelSelect(LogLevel.ERROR)}
                    style={{paddingHorizontal: spacing.small}}                    
                    bottomSeparator={true}
                />
                <ListItem                    
                    text={LogLevel.INFO.toUpperCase()}
                    subTx="loglevelInfoDesc"
                    leftIcon={selectedLogLevel === LogLevel.INFO ? 'faCheckCircle' : 'faCircle'}          
                    leftIconColor={selectedLogLevel === LogLevel.INFO ? iconSelectedColor as string : iconColor as string}                    
                    onPress={() => onLogLevelSelect(LogLevel.INFO)}
                    style={{paddingHorizontal: spacing.small}}                    
                    bottomSeparator={true}
                />
                <ListItem                    
                    text={LogLevel.DEBUG.toUpperCase()}
                    subTx="loglevelDebugDesc"
                    leftIcon={selectedLogLevel === LogLevel.DEBUG ? 'faCheckCircle' : 'faCircle'}          
                    leftIconColor={selectedLogLevel === LogLevel.DEBUG ? iconSelectedColor as string : iconColor as string}                    
                    onPress={() => onLogLevelSelect(LogLevel.DEBUG)}
                    style={{paddingHorizontal: spacing.small}}                    
                    bottomSeparator={true}
                />
                <View style={$buttonContainer}>
                    <Button
                        preset="secondary"
                        tx='common.close'
                        onPress={toggleLogLevelSelector}
                    />
                </View>

            </>
          }
          onBackButtonPress={toggleLogLevelSelector}
          onBackdropPress={toggleLogLevelSelector}
        />
        {isLoading && <Loading />}
        {error && <ErrorModal error={error} />}
        {info && <InfoModal message={info} />}
      </Screen>
    )
  })

const $screen: ViewStyle = {
  flex: 1,
}

const $headerContainer: TextStyle = {
  alignItems: 'center',
  padding: spacing.medium,
  height: spacing.screenHeight * 0.1,
}

const $contentContainer: TextStyle = {
  // flex: 1,
  padding: spacing.extraSmall,
  // alignItems: 'center',
}

const $card: ViewStyle = {
  marginBottom: 0,
}

const $item: ViewStyle = {
  paddingHorizontal: spacing.small,
  paddingLeft: 0,
}

const $rightContainer: ViewStyle = {
  padding: spacing.extraSmall,
  alignSelf: 'center',
  marginLeft: spacing.small,
}

const $buttonContainer: ViewStyle = {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: spacing.large,
}

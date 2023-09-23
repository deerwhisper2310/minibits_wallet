import {observer} from 'mobx-react-lite'
import React, {FC, useCallback, useEffect, useState} from 'react'
import {TextStyle, View, ViewStyle} from 'react-native'
import {
    APP_ENV,      
    CODEPUSH_STAGING_DEPLOYMENT_KEY,
    CODEPUSH_PRODUCTION_DEPLOYMENT_KEY,
    MINIBITS_NIP05_DOMAIN,
    MINIBITS_RELAY_URL, 
} from '@env'
import codePush, { RemotePackage } from 'react-native-code-push'
import {colors, spacing, useThemeColor} from '../theme'
import {SettingsStackScreenProps} from '../navigation' // @demo remove-current-line
import {Icon, ListItem, Screen, Text, Card} from '../components'
import {useHeader} from '../utils/useHeader'
import {useStores} from '../models'
import {translate} from '../i18n'
import { Env, log } from '../utils/logger'
import { round } from '../utils/number'
import { NostrClient } from '../services'
import { useFocusEffect } from '@react-navigation/native'

interface SettingsScreenProps extends SettingsStackScreenProps<'Settings'> {}

const deploymentKey = APP_ENV === Env.PROD ? CODEPUSH_PRODUCTION_DEPLOYMENT_KEY : CODEPUSH_STAGING_DEPLOYMENT_KEY

export const SettingsScreen: FC<SettingsScreenProps> = observer(
  function SettingsScreen(_props) {
    const {navigation} = _props
    useHeader({}) // default header component
    const {mintsStore} = useStores()

    const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false)
    const [updateDescription, setUpdateDescription] = useState<string>('')
    const [relayConnectionStatus, setRelayConnectionStatus] = useState<'Connected' | 'Disconnected'>('Disconnected')
    const [updateSize, setUpdateSize] = useState<string>('')
    const [isNativeUpdateAvailable, setIsNativeUpdateAvailable] = useState<boolean>(false)

    useEffect(() => {
        const checkForUpdate = async () => {
            try {
                const update = await codePush.checkForUpdate(deploymentKey, handleBinaryVersionMismatchCallback)
                if (update && update.failedInstall !== true) {  // do not announce update that failed to install before
                    setUpdateDescription(update.description)
                    setUpdateSize(`${round(update.packageSize *  0.000001, 2)}MB`)                  
                    setIsUpdateAvailable(true)
                }
                
            } catch (e: any) {
                log.info(e.name, e.message)
                return false // silent
            }
        } 
        checkForUpdate()
    }, [])


    /*useFocusEffect(
        useCallback(() => {
            const connectionStatus = () => {                
                try {
                    const status: {relay: string, status: number}[] = NostrClient.getRelaysConnectionStatus() // WIP

                    if(status) {
                        const connectionCode = status.find(s => s.relay === MINIBITS_RELAY_URL + '/')?.status
                        
                        if(connectionCode && connectionCode === 1) {
                            setRelayConnectionStatus('Connected')
                        }
                    }
                } catch(e: any) {

                }                
            }

            connectionStatus()
            
        }, []),
    )*/

    const handleBinaryVersionMismatchCallback = function(update: RemotePackage) {            
        setIsNativeUpdateAvailable(true)
    }

    const gotoMints = function() {
      navigation.navigate('Mints', {})
    }

    const gotoSecurity = function() {
      navigation.navigate('Security')
    }

    const gotoDevOptions = function() {
      navigation.navigate('Developer')
    }

    const gotoBackupRestore = function() {
      navigation.navigate('Backup')
    }

    const gotoUpdate = function() {
        navigation.navigate('Update', {
            isNativeUpdateAvailable, 
            isUpdateAvailable, 
            updateDescription,
            updateSize
        })
    }

    const $itemRight = {color: useThemeColor('textDim')}
    const headerBg = useThemeColor('header')
    
    return (
      <Screen style={$screen} preset='auto'>
        <View style={[$headerContainer, {backgroundColor: headerBg}]}>
          <Text
            preset='heading'
            tx='settingsScreen.title'
            style={{color: 'white'}}
          />
        </View>
        <View style={$contentContainer}>
          <Card
            style={$card}
            ContentComponent={
              <>
                <ListItem
                    tx='settingsScreen.manageMints'
                    leftIcon='faCoins'
                    leftIconColor={colors.palette.iconBlue300}
                    leftIconInverse={true}
                    RightComponent={
                        <View style={$rightContainer}>
                        <Text 
                            style={$itemRight}
                            text={translate('settingsScreen.mintsCount', {count: mintsStore.mintCount})}
                        />
                        </View>
                    }
                    style={$item}
                    bottomSeparator={true}
                    onPress={gotoMints}
                />
                <ListItem
                    tx='settingsScreen.backupRecovery'
                    leftIcon='faCloudArrowUp'
                    leftIconColor={colors.palette.success300}
                    leftIconInverse={true}
                    style={$item}
                    bottomSeparator={true}
                    onPress={gotoBackupRestore}
                />
                <ListItem
                    tx='settingsScreen.security'
                    leftIcon='faShieldHalved'
                    leftIconColor={colors.palette.iconGreyBlue400}
                    leftIconInverse={true}
                    style={$item}
                    bottomSeparator={true}
                    onPress={gotoSecurity}
                />
                <ListItem
                    tx='settingsScreen.update'     
                    leftIcon='faWandMagicSparkles'
                    leftIconColor={(isUpdateAvailable || isNativeUpdateAvailable) ? colors.palette.iconMagenta200 : colors.palette.neutral400}
                    leftIconInverse={true}
                    RightComponent={
                        <View style={$rightContainer}>
                        <Text
                            style={$itemRight}                         
                            text={(isUpdateAvailable || isNativeUpdateAvailable) ? '1 update' : ''}
                        />
                        </View>
                    }
                    style={$item}
                    bottomSeparator={true}
                    onPress={gotoUpdate}
                />
                <ListItem
                    tx='settingsScreen.devOptions'
                    leftIcon='faCode'
                    leftIconColor={colors.palette.accent300}
                    leftIconInverse={true}
                    style={$item}                  
                    onPress={gotoDevOptions}
                />
              </>
            }
          />
          {/*<Card
            style={[$card, {marginTop: spacing.medium}]}
            ContentComponent={
              <>   
                <ListItem
                    text='Relay connection status'
                    subText={MINIBITS_RELAY_URL}
                    leftIcon='faPaperPlane'
                    leftIconColor={colors.palette.iconViolet200}
                    leftIconInverse={true}
                    RightComponent={
                        <View style={$rightContainer}>
                        <Text
                            style={$itemRight}                         
                            text={relayConnectionStatus}
                        />
                        </View>
                    }
                    style={$item}                  
                    // onPress={gotoDevOptions}
                />
              </>
            }
        />*/}
        </View>
      </Screen>
    )
  },
)

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
  // marginVertical: 0,
}

const $item: ViewStyle = {
  // paddingHorizontal: spacing.small,
  paddingLeft: 0,
}

const $rightContainer: ViewStyle = {
  padding: spacing.extraSmall,
  alignSelf: 'center',
  marginLeft: spacing.small,
}


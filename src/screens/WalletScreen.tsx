import {observer} from 'mobx-react-lite'
import React, {FC, useState, useEffect, useCallback, useRef} from 'react'
import {useFocusEffect} from '@react-navigation/native'
import {
  TextStyle,
  ViewStyle,
  View,
  Text as RNText,
  AppState,
  Image,  
  Animated,
  FlatList,
  Pressable,
  Linking,
  LayoutAnimation
} from 'react-native'
import codePush, { RemotePackage } from 'react-native-code-push'
import {moderateVerticalScale, verticalScale} from '@gocodingnow/rn-size-matters'
import { SvgXml } from 'react-native-svg'
import PagerView, { PagerViewOnPageScrollEventData } from 'react-native-pager-view'
import { ScalingDot, SlidingDot } from 'react-native-animated-pagination-dots'
import {useThemeColor, spacing, colors, typography} from '../theme'
import {
  Button,
  Icon,
  Screen,
  Text,
  Card,
  ListItem,
  InfoModal,
  Loading,
  BottomModal,
  ErrorModal,
  Header,
  ScanIcon,
  MintIcon
} from '../components'
import {useStores} from '../models'
import {WalletStackScreenProps} from '../navigation'
import {Mint, MintBalance, MintStatus, UnitBalance} from '../models/Mint'
import {MintsByHostname, MintsByUnit} from '../models/MintsStore'
import {log, NostrClient} from '../services'
import {Env} from '../utils/envtypes'
import {Transaction} from '../models/Transaction'
import {TransactionListItem} from './Transactions/TransactionListItem'
import {WalletTask} from '../services'
import {translate} from '../i18n'
import AppError, { Err } from '../utils/AppError'
import {
    APP_ENV,      
    CODEPUSH_STAGING_DEPLOYMENT_KEY,
    CODEPUSH_PRODUCTION_DEPLOYMENT_KEY,
    MINIBITS_MINT_URL,
    NATIVE_VERSION_ANDROID
} from '@env'
import { round } from '../utils/number'
import { IncomingParser } from '../services/incomingParser'
import useIsInternetReachable from '../utils/useIsInternetReachable'
import { CurrencySign } from './Wallet/CurrencySign'
import { Currencies, CurrencyCode, MintUnit, MintUnitCurrencyPairs, MintUnits } from "../services/wallet/currency"
import { CurrencyAmount } from './Wallet/CurrencyAmount'
import { ReceiveOption } from './ReceiveOptionsScreen'

// refresh

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView)
const deploymentKey = APP_ENV === Env.PROD ? CODEPUSH_PRODUCTION_DEPLOYMENT_KEY : CODEPUSH_STAGING_DEPLOYMENT_KEY

interface WalletScreenProps extends WalletStackScreenProps<'Wallet'> {}

type RelayStatus = {
    relay: string, 
    status: number, 
    error?: string
}

export const WalletScreen: FC<WalletScreenProps> = observer(
  function WalletScreen({route, navigation}) {    
    const {
        mintsStore, 
        proofsStore, 
        transactionsStore, 
        paymentRequestsStore, 
        userSettingsStore, 
        walletProfileStore
    } = useStores()
    
    const appState = useRef(AppState.currentState)
    const isInternetReachable = useIsInternetReachable()
    const returnWithNavigationReset = route.params?.returnWithNavigationReset
   
    const [info, setInfo] = useState<string>('')
    const [defaultMintUrl, setDefaultMintUrl] = useState<string>(MINIBITS_MINT_URL)
    const [error, setError] = useState<AppError | undefined>()
    const [isLoading, setIsLoading] = useState<boolean>(false)
    
    const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false)
    const [isUpdateModalVisible, setIsUpdateModalVisible] = useState<boolean>(false)
    const [updateDescription, setUpdateDescription] = useState<string>('')
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
                    toggleUpdateModal()
                    log.info('OTA Update available', update, 'checkForUpdate')
                }             
            } catch (e: any) {                
                return false // silent
            }           

        } 
        
        setTimeout(() => {
            if(!isInternetReachable) {
                return
            }
            checkForUpdate()
        }, 100)
        
    }, [])


    
    const handleBinaryVersionMismatchCallback = function(update: RemotePackage) {
        log.info('[handleBinaryVersionMismatchCallback] triggered', NATIVE_VERSION_ANDROID, update)
        // setIsNativeUpdateAvailable(true)
        // toggleUpdateModal()
    }

    
    useEffect(() => {
        // get deeplink if any
        const getInitialData  = async () => {
            const url = await Linking.getInitialURL()
            
            // log.trace('returnWithNavigationReset', returnWithNavigationReset)
                      
            if (url && !returnWithNavigationReset) {                            
                handleDeeplink({url})                
                return // deeplinks have priority over clipboard
            }
            
            if(!isInternetReachable) { return }

            // Auto-recover inflight proofs - do only on startup and before checkPendingReceived to prevent conflicts
            // TODO add manual option to recovery settings
            WalletTask.handleInFlight().catch(e => false)
            // Create websocket subscriptions to receive tokens or payment requests by NOSTR DMs                    
            WalletTask.receiveEventsFromRelays().catch(e => false)
            // log.trace('[getInitialData]', 'walletProfile', walletProfileStore)            
        }
        
        Linking.addEventListener('url', handleDeeplink)
        getInitialData()

        return () => {}
    }, [])


    const handleDeeplink = async function ({url}: {url: string}) {
        try {

            const incomingData = IncomingParser.findAndExtract(url)
            await IncomingParser.navigateWithIncomingData(incomingData, navigation)

        } catch (e: any) {
            handleError(e)
        }
    }


    const handleClipboard = function (clipboard: string) {
        log.trace('clipboard', clipboard, 'handleClipboard')
    }
    

    const gotoUpdate = function() {
        navigation.navigate('SettingsNavigator', {screen: 'Update', params: {
            isNativeUpdateAvailable, 
            isUpdateAvailable, 
            updateDescription,
            updateSize
        }})
    }   
    

    useFocusEffect(        
        useCallback(() => {
            if(!isInternetReachable) {
                return
            }                
            WalletTask.handleSpentFromPending().catch(e => false)               
            WalletTask.handlePendingTopups().catch(e => false)            
        }, [])
    )

  
    useFocusEffect(
        useCallback(() => {
            if (!route.params?.scannedMintUrl) {                
                return
            }

            const scannedMintUrl = route.params?.scannedMintUrl         
            addMint({scannedMintUrl})

        }, [route.params?.scannedMintUrl])
    )


    useEffect(() => {        
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active') {

                    if(!isInternetReachable) {
                        return
                    } 

                    WalletTask.handleSpentFromPending().catch(e => false) 
                    WalletTask.handlePendingTopups().catch(e => false)
                    // calls checkPendingReceived if re-connects
                    NostrClient.reconnectToRelays().catch(e => false)           
            }
    
            appState.current = nextAppState         
        })        
    
        return () => {
          subscription.remove()          
        }
    }, [])


    const toggleUpdateModal = () => {
        setIsUpdateModalVisible(previousState => !previousState)
    }


    const addMint = async function ({scannedMintUrl = ''} = {}) {
        // necessary
        navigation.setParams({scannedMintUrl: undefined})       

        const newMintUrl = scannedMintUrl || defaultMintUrl
        
        log.trace('newMintUrl', newMintUrl)

        if(newMintUrl.includes('.onion')) {
            if(!userSettingsStore.isTorDaemonOn) {
                setInfo('Please enable Tor daemon in Privacy settings before connecting to the mint using .onion address.')
                return
            }
        }
        
        if (mintsStore.alreadyExists(newMintUrl)) {
            const msg = translate('mintsScreen.mintExists')
            log.info(msg)
            setInfo(msg)
            return
        }

        try {
            setIsLoading(true)
            await mintsStore.addMint(newMintUrl)
        } catch (e: any) {
            handleError(e)
        } finally {
            setIsLoading(false)
        }
    }

    const gotoReceiveOptions = function (unit: MintUnit) {
        navigation.navigate('ReceiveOptions', {unit})
    }

    const gotoSendOptions = function (unit: MintUnit) {
        navigation.navigate('SendOptions', {unit})
    }

    const gotoScan = function () {
        navigation.navigate('Scan')
    }

    /* const gotoMintInfo = function (mintUrl: string) {
        navigation.navigate('SettingsNavigator', {screen: 'MintInfo', params: {mintUrl}})
    } */

    const gotoTranHistory = function () {
        navigation.navigate('TranHistory')
    }

    const gotoTranDetail = function (id: number) {
      navigation.navigate('TranDetail', {id} as any)
    }

    const gotoPaymentRequests = function () {
        navigation.navigate('PaymentRequests')
    }
    
    /* Mints pager */
    const groupedMints = mintsStore.groupedByUnit
    // log.trace('[WalletScreen]', {groupedByUnit: groupedMints})
    const width = spacing.screenWidth
    const pagerRef = useRef<PagerView>(null)
    const scrollOffsetAnimatedValue = React.useRef(new Animated.Value(0)).current
    const positionAnimatedValue = React.useRef(new Animated.Value(0)).current
    const inputRange = [0, groupedMints.length]
    const scrollX = Animated.add(
        scrollOffsetAnimatedValue,
        positionAnimatedValue
    ).interpolate({
        inputRange,
        outputRange: [0, groupedMints.length * width],
    })

    const onPageScroll = React.useMemo(
        () =>
          Animated.event<PagerViewOnPageScrollEventData>(
            [
              {
                nativeEvent: {
                  offset: scrollOffsetAnimatedValue,
                  position: positionAnimatedValue,
                },
              },
            ],
            {
              useNativeDriver: false,
            }
          ),
          
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    )



    const handleError = function (e: AppError) {
      setIsLoading(false)
      setError(e)
    }

    const balances = proofsStore.getBalances()
    const screenBg = useThemeColor('background')
    const iconInfo = useThemeColor('textDim')

    return (        
      <Screen contentContainerStyle={$screen}>
            <Header 
                leftIcon='faListUl'
                leftIconColor={colors.palette.primary100}
                // style={{borderWidth: 1, borderColor: 'red'}}
                onLeftPress={gotoTranHistory}
                TitleActionComponent={!isInternetReachable ? (
                        <Text   
                            tx={'common.offline'}
                            style={$offline}
                            size='xxs'                          
                        />
                    ) : (
                        groupedMints.length > 1 ? (
                            <ScalingDot
                                testID={'sliding-border'}                        
                                data={groupedMints}
                                inActiveDotColor={colors.palette.primary300}
                                activeDotColor={colors.palette.primary100}
                                activeDotScale={1}
                                containerStyle={{marginBottom: -spacing.tiny}}
                                //@ts-ignore
                                scrollX={scrollX}
                                dotSize={25}
                            />
                    ) : undefined
                )}                
                RightActionComponent={
                <>
                    {paymentRequestsStore.countNotExpired > 0 && (
                        <Pressable 
                            style={{flexDirection: 'row', alignItems:'center', marginRight: spacing.medium}}
                            onPress={() => gotoPaymentRequests()}
                        >
                            <Icon icon='faPaperPlane' color={'white'}/>
                            <Text text={`${paymentRequestsStore.countNotExpired}`} style={{color: 'white'}} />
                        </Pressable>
                    )}
                </>
                }                
            />
            {groupedMints.length === 0 && (
                <>
                    <ZeroBalanceBlock/>
                    <View style={$contentContainer}>
                        <PromoBlock addMint={addMint} />
                    </View>
                </>
            )}
            <AnimatedPagerView                            
                initialPage={0}
                ref={pagerRef}    
                style={{flexGrow: 1}}                                                        
                onPageScroll={onPageScroll}
            >
                {groupedMints.map((mints) => (
                    <View key={mints.unit}>
                        <UnitBalanceBlock                            
                            unitBalance={balances.unitBalances.find(balance => balance.unit === mints.unit)!}
                        />
                        <View style={$contentContainer}>
                            <MintsByUnitListItem                                    
                                mintsByUnit={mints}                                
                                navigation={navigation}                                     
                            />
                            {/*<View style={$buttonContainer}>
                                <Button
                                    tx={'walletScreen.receive'}
                                    LeftAccessory={() => (
                                        <Icon
                                        icon='faArrowDown'
                                        color='white'
                                        size={spacing.medium}                  
                                        />
                                    )}
                                    onPress={() => gotoReceiveOptions(mints.unit)}
                                    style={[$buttonReceive, {borderRightColor: screenBg}]}
                                />
                                <Button
                                    tx={'walletScreen.send'}
                                    RightAccessory={() => (
                                        <Icon
                                        icon='faArrowUp'
                                        color='white'
                                        size={spacing.medium}                  
                                        />
                                    )}
                                    onPress={() => gotoSendOptions(mints.unit)}
                                    style={[$buttonSend, {borderLeftColor: screenBg}]}
                                />
                                </View>*/}
                            {transactionsStore.recentByUnit(mints.unit).length > 0 && (
                                <Card                                    
                                    ContentComponent={                                            
                                        <FlatList
                                            data={transactionsStore.recentByUnit(mints.unit) as Transaction[]}
                                            renderItem={({item, index}) => {
                                                return (<TransactionListItem
                                                    key={item.id}
                                                    transaction={item}
                                                    isFirst={index === 0}
                                                    isTimeAgoVisible={true}
                                                    gotoTranDetail={gotoTranDetail}
                                                />)
                                                }
                                            }
                                            // keyExtractor={(item, index) => item.id}
                                            // contentContainerStyle={{paddingRight: spacing.small}}
                                            style={{ maxHeight: 300 - (mints.mints.length > 1 ? mints.mints.length * 38 : 0)}}
                                        />                                            
                                    }
                                    style={[$card, {paddingTop: spacing.extraSmall}]}
                                />
                            )}
                        </View>                        
                    </View>     
                ))}                       
            </AnimatedPagerView>
            <View style={$bottomContainer}>                
                <Button
                    RightAccessory={() => (
                        <SvgXml 
                            width={spacing.large + 10} 
                            height={spacing.large + 10} 
                            xml={ScanIcon}
                            fill={iconInfo}
                        />
                    )}
                    onPress={gotoScan}
                    style={$buttonScan}
                    preset='tertiary'
                />
            </View>       
        {isLoading && <Loading />}       
        <BottomModal
          isVisible={isUpdateModalVisible ? true : false}
          style={{alignItems: 'stretch'}}
          ContentComponent={        
            <ListItem
                LeftComponent={
                    <View style={{marginRight: spacing.medium}}>                        
                        <Image 
                            source={{uri: 'https://www.minibits.cash/img/minibits_icon-192.png'}}
                            style={{width: 40, height: 40}}
                        />
                    </View>
                }
                text='New Minibits version is available'
                subText='Updates provide new functionalities and important bug fixes. View details in the Update manager.'
                onPress={gotoUpdate}
            />
          }
          onBackButtonPress={toggleUpdateModal}
          onBackdropPress={toggleUpdateModal}
        />        
        {info && <InfoModal message={info} />}
        {error && <ErrorModal error={error} />}
      </Screen>
    )
  },
)


const UnitBalanceBlock = observer(function (props: {
    unitBalance: UnitBalance
}) {
    const headerBg = useThemeColor('header')
    const balanceColor = 'white'
    const currencyColor = colors.palette.primary200
    const {unitBalance} = props
    
    // log.trace('[UnitBalanceBlock]', {unitBalance})

    return (
        <View style={[$headerContainer, {backgroundColor: headerBg}]}>
            <CurrencySign                
                mintUnit={unitBalance.unit}
                size='small'
                textStyle={{color: balanceColor}}
            />
            <CurrencyAmount
                amount={unitBalance.unitBalance || 0}
                mintUnit={unitBalance.unit}
                symbolStyle={{display: 'none'}}
                amountStyle={[$unitBalance, {color: balanceColor, marginTop: spacing.small}]}
            />
        </View>
    )
})


const ZeroBalanceBlock = function () {
    const headerBg = useThemeColor('header')
    const balanceColor = 'white'
    const currencyColor = colors.palette.primary200
    

    return (
        <View style={[$headerContainer, {backgroundColor: headerBg}]}>
            <Text                
                preset='heading'              
                style={[$unitBalance, {color: balanceColor}]}            
                text={'0'}
            />
        </View>
    )
}

const PromoBlock = function (props: {addMint: any}) {
    return (
        <Card
            HeadingComponent={
            <View style={$promoIconContainer}>
                <Icon icon='faBurst' size={50} color={colors.palette.accent400} />
            </View>
            }
            ContentComponent={
            <View style={{flexDirection: 'row'}}>
                <RNText style={$promoText}>
                Add{' '}
                <Text
                    text='Minibits'
                    style={{fontFamily: 'Gluten-Regular', fontSize: 18}}
                />{' '}
                as your first mint to start!
                </RNText>
            </View>
            }
            style={[$card, {marginTop: spacing.small}]}
            FooterComponent={
            <View style={{alignItems: 'center'}}>
                <Button
                    preset='default'
                    onPress={props.addMint}
                    text='Add your first mint'
                />
            </View>
            }            
        />
    )
}


const MintsByUnitListItem = observer(function (props: {
    mintsByUnit: MintsByUnit    
    navigation: any
}) {
    
    const [selectedMintUrl, setSelectedMintUrl] = useState<string | undefined>(undefined)

    const onSelectedMint = function (mintUrl: string) {
        if (selectedMintUrl && selectedMintUrl === mintUrl) {            
            LayoutAnimation.easeInEaseOut()
            setSelectedMintUrl(undefined)
            return
        }

        LayoutAnimation.easeInEaseOut()
        setSelectedMintUrl(mintUrl)        
    }

    const gotoMintInfo = function (mintUrl: string) {
        props.navigation.navigate('SettingsNavigator', {screen: 'MintInfo', params: {mintUrl}})
    }


    const gotoTopup = function (mintUrl: string, unit: MintUnit) {
        props.navigation.navigate('Topup', {                        
            mintUrl,
            unit
        })
    }


    const gotoLightningPay = async function (mintUrl: string, unit: MintUnit) {
        props.navigation.navigate('LightningPay', {
            mintUrl,
            unit
        })
    }


    const gotoSend = async function (mintUrl: string, unit: MintUnit) {
        props.navigation.navigate('Send', {
            mintUrl,
            unit
        })
    }

    
    const color = useThemeColor('textDim')
    const balanceColor = useThemeColor('amount')
    const {mintsByUnit} = props

    const getMintColor = function (unit: MintUnit) {
        if (unit === 'sat' || unit === 'msat' || unit === 'btc') {
            return colors.palette.orange400
        }

        if (unit === 'eur') {
            return colors.palette.blue400
        }

        if (unit === 'usd') {
            return colors.palette.green400
        }
    }

    /* const isSingleMint: boolean = mintsByUnit.mints.length === 1 || false
    const singleMint: Mint = mintsByUnit.mints[0] */


    return (
        <Card
            verticalAlignment='force-footer-bottom'            
            ContentComponent={
            <>                
                {mintsByUnit.mints.map((mint: Mint) => (
                    <View key={mint.mintUrl}>
                    <ListItem                        
                        text={mint.shortname}
                        subText={mint.hostname}                    
                        // leftIcon={mint.status === MintStatus.OFFLINE ? 'faTriangleExclamation' : 'faMoneyBill1'}              
                        // leftIconInverse={true}
                        // leftIconColor={mint.color}
                        LeftComponent={
                            <View
                                style={{
                                    marginEnd: spacing.small,
                                    flex: 0,
                                    borderRadius: spacing.small,
                                    padding: spacing.extraSmall,
                                    backgroundColor: getMintColor(mintsByUnit.unit)
                                }}
                            >
                                <SvgXml 
                                    width={spacing.medium} 
                                    height={spacing.medium} 
                                    xml={MintIcon}
                                    fill='white'
                                />
                            </View>
                        }
                        RightComponent={
                            <CurrencyAmount 
                                amount={mint.balances?.balances[mintsByUnit.unit as MintUnit] || 0}
                                mintUnit={mintsByUnit.unit}
                                size='medium'
                            />                    
                        }
                        //topSeparator={true}
                        style={$item}
                        onPress={() => onSelectedMint(mint.mintUrl)}
                    />
                    {selectedMintUrl === mint.mintUrl &&  (
                        <View style={{flexDirection: 'row', marginBottom: spacing.small}}>
                            <Button
                                text={'Topup'}
                                LeftAccessory={() => (
                                    <Icon
                                    icon='faPlus'
                                    color={color}
                                    size={spacing.small}                  
                                    />
                                )}
                                preset='secondary'
                                textStyle={{fontSize: 14, color}}
                                onPress={() => gotoTopup(mint.mintUrl, mintsByUnit.unit)}
                                style={{
                                    minHeight: moderateVerticalScale(40), 
                                    paddingVertical: moderateVerticalScale(spacing.tiny),
                                    marginRight: spacing.tiny
                                }}                    
                            />
                            {/*<Button
                                text={'Exchange'}
                                LeftAccessory={() => (
                                    <Icon
                                    icon='faRotate'
                                    color={color}
                                    size={spacing.medium}                  
                                    />
                                )}
                                textStyle={{fontSize: 14, color}}
                                preset='tertiary'
                                onPress={props.gotoMintInfo}
                                style={{minHeight: moderateVerticalScale(40), paddingVertical: moderateVerticalScale(spacing.tiny)}}                    
                            />*/}
                            <Button
                                text={'Pay'}
                                LeftAccessory={() => (
                                    <Icon
                                    icon='faArrowTurnUp'
                                    color={color}
                                    size={spacing.small}                  
                                    />
                                )}
                                textStyle={{fontSize: 14, color}}
                                preset='secondary'
                                onPress={() => gotoLightningPay(mint.mintUrl, mintsByUnit.unit)}
                                style={{
                                    minHeight: moderateVerticalScale(40), 
                                    paddingVertical: moderateVerticalScale(spacing.tiny),
                                    marginRight: spacing.tiny
                                }}                    
                            />
                            <Button
                                text={'Send'}
                                LeftAccessory={() => (
                                    <Icon
                                    icon='faMoneyBill1'
                                    color={color}
                                    size={spacing.medium}                  
                                    />
                                )}
                                textStyle={{fontSize: 14, color}}
                                preset='secondary'
                                onPress={() => gotoSend(mint.mintUrl, mintsByUnit.unit)}
                                style={{minHeight: moderateVerticalScale(40), paddingVertical: moderateVerticalScale(spacing.tiny)}}                    
                            />
                        </View>
                    )}
                    </View>
                ))}
            </>
            }            
            contentStyle={{color}}            
            style={$card}
        />
    )
})



const $screen: ViewStyle = {
    flex: 1,
}

const $headerContainer: TextStyle = {
    alignItems: 'center',
    // padding: spacing.tiny,  
    height: spacing.screenHeight * 0.20,
}

const $buttonContainer: ViewStyle = {
    flexDirection: 'row',
    alignSelf: 'center',
    marginVertical: spacing.medium,
}

const $contentContainer: TextStyle = {
    marginTop: -spacing.extraLarge * 2,
    // padding: spacing.extraSmall,    
    flex: 1,
    // paddingTop: spacing.extraSmall - 3,
    // borderWidth: 1,
    // borderColor: 'green',
}

const $card: ViewStyle = {
  marginBottom: spacing.small,
  paddingTop: 0,
  marginHorizontal: spacing.extraSmall,
  // alignSelf: 'stretch'
}

const $cardHeading: TextStyle = {
  fontFamily: typography.primary?.medium,
  fontSize: moderateVerticalScale(18),
}

const $unitBalance: TextStyle = {
    fontSize: moderateVerticalScale(48),
    lineHeight: moderateVerticalScale(48)
}

const $promoIconContainer: ViewStyle = {
  marginTop: -spacing.large,
  alignItems: 'center',
}

const $promoText: TextStyle = {
  padding: spacing.small,
  textAlign: 'center',
  fontSize: 18,
}

const $item: ViewStyle = {
  marginHorizontal: spacing.micro,
}

const $mintText: TextStyle = {
  overflow: 'hidden',
  fontSize: 14,
}

const $balanceContainer: ViewStyle = {
  justifyContent: 'center',
  alignSelf: 'center',
  marginRight: spacing.extraSmall,
}

const $balance: TextStyle = {
  fontSize: verticalScale(20),
  fontFamily: typography.primary?.medium,
}

const $bottomContainer: ViewStyle = {  
  // flex: 0.18,
  // justifyContent: 'flex-end',
  marginBottom: spacing.medium,
  alignSelf: 'center',
  // opacity: 0,
}

const $buttonReceive: ViewStyle = {
  borderTopLeftRadius: 30,
  borderBottomLeftRadius: 30,
  borderTopRightRadius: 0,
  borderBottomRightRadius: 0,
  minWidth: verticalScale(130),
  borderRightWidth: 1,  
}

const $buttonScan: ViewStyle = {
  // borderRadius: verticalScale(60 / 2),
  minWidth: verticalScale(60),
}

const $buttonSend: ViewStyle = {
  borderTopLeftRadius: 0,
  borderBottomLeftRadius: 0,
  borderTopRightRadius: 30,
  borderBottomRightRadius: 30,
  minWidth: verticalScale(130),
  borderLeftWidth: 1,  
}

const $bottomModal: ViewStyle = {    
    alignItems: 'center',  
    paddingVertical: spacing.large,
    paddingHorizontal: spacing.small,  
}


const $offline: TextStyle = {
    paddingHorizontal: spacing.small,
    borderRadius: spacing.tiny,
    alignSelf: 'center',
    marginVertical: spacing.small,
    lineHeight: spacing.medium,    
    backgroundColor: colors.palette.orange400,
    color: 'white',
}

import { StackNavigationProp } from '@react-navigation/stack'
import { ReceiveOption, SendOption } from '../screens'
import AppError, { Err } from '../utils/AppError'
import { log } from './logService'
import { CashuUtils } from './cashu/cashuUtils'
import { LightningUtils } from './lightning/lightningUtils'
import { LnurlUtils } from './lnurl/lnurlUtils'
import { LNURLPayParams, LnurlClient } from './lnurlService'
import { MintUnit } from './wallet/currency'
import { RootNavigation } from '../navigation'
import { NavigationProp } from '@react-navigation/native'

export enum IncomingDataType {
    CASHU = 'CASHU',
    CASHU_PAYMENT_REQUEST = 'CASHU_PAYMENT_REQUEST',
    INVOICE = 'INVOICE',
    LNURL = 'LNURL',
    LNURL_ADDRESS = 'LNURL_ADDRESS',
    MINT_URL = 'MINT_URL',
}

const findAndExtract = function (
    incomingData: string, 
    expectedType?: IncomingDataType
): {type: IncomingDataType, encoded: any} {

    if(expectedType) {

        let encoded: string
        incomingData = incomingData.trim()
        
        switch (expectedType) {
            case IncomingDataType.CASHU:
                encoded = CashuUtils.extractEncodedCashuToken(incomingData)                
                return {
                    type: expectedType,
                    encoded
                }
            case IncomingDataType.CASHU_PAYMENT_REQUEST:
                encoded = CashuUtils.extractEncodedCashuPaymentRequest(incomingData)                
                return {
                    type: expectedType,
                    encoded
                }
            case IncomingDataType.INVOICE:
                encoded = LightningUtils.extractEncodedLightningInvoice(incomingData)                
                return {
                    type: expectedType,
                    encoded
                }
            case (IncomingDataType.LNURL):
                encoded = LnurlUtils.extractEncodedLnurl(incomingData)                
                return {
                    type: expectedType,
                    encoded
                }
            case (IncomingDataType.LNURL_ADDRESS):
                encoded = LnurlUtils.extractLnurlAddress(incomingData)                
                return {
                    type: expectedType,
                    encoded
                }                
            case IncomingDataType.MINT_URL:
                const url = new URL(incomingData) // throws

                return {
                    type: expectedType,
                    encoded: incomingData
                }  
            default:
                throw new AppError(Err.NOTFOUND_ERROR, 'Unknown expectedType', {expectedType})
        }
    }
    
    const maybeToken = CashuUtils.findEncodedCashuToken(incomingData)

    if(maybeToken) {
        const encoded = CashuUtils.extractEncodedCashuToken(maybeToken) // throws

        return {
            type: IncomingDataType.CASHU,
            encoded
        }
    }

    const maybeCashuPaymentRequest = CashuUtils.findEncodedCashuPaymentRequest(incomingData)

    if(maybeCashuPaymentRequest) {
        log.trace('Got maybeCashuPaymentRequest', maybeCashuPaymentRequest, 'findAndExtract')

        const encoded = CashuUtils.extractEncodedCashuPaymentRequest(maybeCashuPaymentRequest) // throws

        return {
            type: IncomingDataType.CASHU_PAYMENT_REQUEST,
            encoded
        }
    }

    const maybeInvoice = LightningUtils.findEncodedLightningInvoice(incomingData)

    if(maybeInvoice) {
        log.trace('Got maybeInvoice', maybeInvoice, 'findAndExtract')

        const encoded = LightningUtils.extractEncodedLightningInvoice(maybeInvoice) // throws

        return {
            type: IncomingDataType.INVOICE,
            encoded
        }
    }
    
    const maybeLnurlAddress = LnurlUtils.findEncodedLnurlAddress(incomingData)

    if(maybeLnurlAddress) {
        log.trace('[findAndExtract] Got maybeLnurlAddress', maybeLnurlAddress)

        const encoded = LnurlUtils.extractLnurlAddress(maybeLnurlAddress) // throws

        return {
            type: IncomingDataType.LNURL_ADDRESS,
            encoded
        }
    }

    const maybeLnurl = LnurlUtils.findEncodedLnurl(incomingData)

    if(maybeLnurl) {
        log.trace('[findAndExtract] Got maybeLnurl', maybeLnurl)

        const encoded = LnurlUtils.extractEncodedLnurl(maybeLnurl) // throws

        return {
            type: IncomingDataType.LNURL,
            encoded
        }
    }

    const maybeMintUrl = new URL(incomingData) // throws

    if(incomingData.startsWith('http')) {
        log.trace('[findAndExtract] Got maybeMintUrl', incomingData)

        return {
            type: IncomingDataType.MINT_URL,
            encoded: incomingData
        }
    }

    throw new AppError(Err.VALIDATION_ERROR, 'Unknown incoming data type.', {
        incomingData,
        expectedType,
        caller: 'findAndExtract'                     
    })
}


const navigateWithIncomingData = async function (
    incoming: {
        type: IncomingDataType, 
        encoded: any
    },
    navigation: Omit<NavigationProp<ReactNavigation.RootParamList>, "getState">, 
    unit: MintUnit,    
    mintUrl?: string
) {
    

    switch (incoming.type) {
        case IncomingDataType.CASHU:
            //@ts-ignore
            return navigation.navigate('WalletNavigator', {
                screen: 'Receive', 
                params: {
                    encodedToken: incoming.encoded,
                }
            })

        case IncomingDataType.CASHU_PAYMENT_REQUEST:
            //@ts-ignore
            return navigation.navigate('WalletNavigator', {
                screen: 'Send', 
                params: {
                    encodedCashuPaymentRequest: incoming.encoded,
                    paymentOption: SendOption.PAY_PAYMENT_REQUEST,
                    unit,
                    mintUrl
                }
            })
                
        case IncomingDataType.INVOICE:
            //@ts-ignore
            return navigation.navigate('WalletNavigator', {
                screen: 'Transfer', 
                params: {
                    encodedInvoice: incoming.encoded,
                    paymentOption: SendOption.PASTE_OR_SCAN_INVOICE,
                    unit,
                    mintUrl
                }
            })

        case (IncomingDataType.LNURL):
            try {
                const paramsResult = await LnurlClient.getLnurlParams(incoming.encoded)
                const {lnurlParams} = paramsResult

                if(lnurlParams.tag === 'withdrawRequest') {
                    //@ts-ignore                
                    return navigation.navigate('WalletNavigator', {
                        screen: 'Topup',
                        params: {
                            lnurlParams,
                            paymentOption: ReceiveOption.LNURL_WITHDRAW,
                            unit,
                            mintUrl
                        }                        
                    })
                }

                if(lnurlParams.tag === 'payRequest') {
                    //@ts-ignore
                    return navigation.navigate('WalletNavigator', {
                        screen: 'Transfer',
                        params: {
                            lnurlParams,                    
                            paymentOption: SendOption.LNURL_PAY,
                            unit,
                            mintUrl
                        }                        
                    })
                }

            } catch (e: any) {
                throw new AppError(Err.SERVER_ERROR, 'Could not get Lightning address details from the server.', {
                    caller: 'navigateWithIncomingData', 
                    message: e.message,                    
                })
            }

            
        case (IncomingDataType.LNURL_ADDRESS):
            try {
                const addressParamsResult = await LnurlClient.getLnurlAddressParams(incoming.encoded) // throws
                //@ts-ignore
                return navigation.navigate('WalletNavigator', {
                    screen: 'Transfer', 
                    params: {
                        lnurlParams: addressParamsResult.lnurlParams as LNURLPayParams,                
                        paymentOption: SendOption.LNURL_PAY,                                     
                        unit,
                        mintUrl
                    }
                })
            } catch (e: any) {
                throw new AppError(Err.SERVER_ERROR, 'Could not get Lightning address details from the server.', {
                    caller: 'navigateWithIncomingData', 
                    message: e.message,
                    providedAddress: incoming.encoded
                })
            }
            
        case IncomingDataType.MINT_URL:
            //@ts-ignore
            return navigation.navigate('WalletNavigator', {
                screen: 'Wallet',
                params: {
                    scannedMintUrl: incoming.encoded,
                }                
            })

        default:
            throw new AppError(Err.NOTFOUND_ERROR, 'Scanned data is neither ecash token, lightning invoice, lnurl or mint URL.')
    } 
}

export const IncomingParser = {
    findAndExtract,
    navigateWithIncomingData
}
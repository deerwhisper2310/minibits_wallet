import React, { FC, useState, useEffect } from 'react'
import { View, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native'
import { BottomModal, Button, Icon, ListItem, Text } from '../components'
import AppError from '../utils/AppError'
import { spacing, useThemeColor, colors } from '../theme'
import { isObj } from '@cashu/cashu-ts/src/utils'
import JSONTree from 'react-native-json-tree'

if (Platform.OS === 'android' &&
    UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true)
}

type ErrorModalProps = {
    error: AppError 
}

export const ErrorModal: FC<ErrorModalProps> = function ({ error }) {    
    

    const [isErrorVisible, setIsErrorVisible] = useState<boolean>(true)
    const [isParamsVisible, setIsParamsVisible] = useState<boolean>(false)

    // needed for error to re-appear
    useEffect(() => {
        setIsErrorVisible(true)
    }, [error])

    const toggleParams = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        setIsParamsVisible(previousState => !previousState)
    }

    const onClose = () => {
        setIsErrorVisible(false)
    }

    const backgroundColor = useThemeColor('error')

    return (
        <BottomModal
            isVisible={isErrorVisible}
            onBackdropPress={onClose}
            onBackButtonPress={onClose}
            style={{ backgroundColor }}            
            ContentComponent={
            <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.small }}>
                    <Icon icon="faInfoCircle" size={spacing.large} color="white" />
                    <Text style={{ color: 'white', marginLeft: spacing.small }}>{error.name}</Text>                
                </View>
                <View>
                    <Text style={{ color: 'white', marginBottom: spacing.small }}>{error.message}</Text>
                </View>
                {error.params && isObj(error.params) && (
                    <View>
                        {isParamsVisible ? (
                            <>
                                <View style={{borderRadius: spacing.small, backgroundColor: '#fff', padding: spacing.tiny}}>
                                    <JSONTree
                                        hideRoot
                                        data={error.params}                                        
                                        theme={{
                                            scheme: 'codeschool',
                                            author: 'brettof86',
                                            base00: '#000000',
                                            base01: '#2e2f30',
                                            base02: '#515253',
                                            base03: '#737475',
                                            base04: '#959697',
                                            base05: '#b7b8b9',
                                            base06: '#dadbdc',
                                            base07: '#fcfdfe',
                                            base08: '#e31a1c',
                                            base09: '#e6550d',
                                            base0A: '#dca060',
                                            base0B: '#31a354',
                                            base0C: '#80b1d3',
                                            base0D: '#3182bd',
                                            base0E: '#756bb1',
                                            base0F: '#b15928'
                                        }}                  
                                    />
                                </View>
                                <Button
                                    onPress={toggleParams}
                                    text='Hide details'
                                    preset='tertiary'
                                />
                            </>
                        ) : (
                            <Button
                                onPress={toggleParams}
                                text='Show details'
                                preset='tertiary'
                            />
                        )}
                    </View>                      
                )}
            </>
            }
        />
    )
}
